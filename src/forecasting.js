const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const cleanValues = (series) => series.map((point) => Number(point?.value ?? point)).filter((value) => Number.isFinite(value) && value >= 0);

function fitLinear(values, alpha, beta) {
  let level = values[0];
  let trend = values.length > 1 ? values[1] - values[0] : 0;
  const fitted = [level];
  const residuals = [0];
  for (let index = 1; index < values.length; index += 1) {
    const estimate = Math.max(0, level + trend);
    fitted.push(estimate);
    residuals.push(values[index] - estimate);
    const previousLevel = level;
    level = alpha * values[index] + (1 - alpha) * (level + trend);
    trend = beta * (level - previousLevel) + (1 - beta) * trend;
  }
  return { level, trend, seasons: null, fitted, residuals };
}

function fitSeasonal(values, seasonalPeriod, alpha, beta, gamma) {
  const firstSeason = values.slice(0, seasonalPeriod);
  const secondSeason = values.slice(seasonalPeriod, seasonalPeriod * 2);
  let level = mean(firstSeason);
  let trend = secondSeason.length === seasonalPeriod ? (mean(secondSeason) - level) / seasonalPeriod : 0;
  const seasons = firstSeason.map((value) => value - level);
  const fitted = [];
  const residuals = [];
  for (let index = 0; index < values.length; index += 1) {
    const seasonIndex = index % seasonalPeriod;
    const seasonal = seasons[seasonIndex] || 0;
    const estimate = index === 0 ? values[0] : Math.max(0, level + trend + seasonal);
    fitted.push(estimate);
    residuals.push(values[index] - estimate);
    const previousLevel = level;
    level = alpha * (values[index] - seasonal) + (1 - alpha) * (level + trend);
    trend = beta * (level - previousLevel) + (1 - beta) * trend;
    seasons[seasonIndex] = gamma * (values[index] - level) + (1 - gamma) * seasonal;
  }
  return { level, trend, seasons, fitted, residuals };
}

function selectFit(values, seasonalPeriod) {
  const candidates = [0.2, 0.4, 0.6, 0.8];
  const seasonal = seasonalPeriod >= 2 && values.length >= seasonalPeriod * 2;
  let best = null;
  for (const alpha of candidates) {
    for (const beta of candidates) {
      for (const gamma of seasonal ? candidates : [null]) {
        const result = seasonal ? fitSeasonal(values, seasonalPeriod, alpha, beta, gamma) : fitLinear(values, alpha, beta);
        const start = seasonal ? seasonalPeriod : 1;
        const sse = result.residuals.slice(start).reduce((sum, value) => sum + value ** 2, 0);
        if (!best || sse < best.sse) best = { ...result, alpha, beta, gamma, sse, seasonal };
      }
    }
  }
  return best;
}

export function fitForecast(series, { horizon = 6, seasonalPeriod = 6, confidenceZ = 1.96 } = {}) {
  const values = cleanValues(series);
  if (!values.length) return { method: "holt_linear", status: "insufficient_history", observations: 0, fitted: [], forecast: [], lower95: [], upper95: [], points: [], params: {}, rmse: null, mape: null, seasonalPeriod: null };
  if (values.length === 1) {
    const forecast = Array(horizon).fill(values[0]);
    return { method: "holt_linear", status: "limited_history", observations: 1, fitted: [values[0]], forecast, lower95: forecast, upper95: forecast, points: forecast.map((value, index) => ({ period: index + 1, value, lower: value, upper: value })), params: {}, rmse: 0, mape: null, seasonalPeriod: null };
  }
  const fit = selectFit(values, seasonalPeriod);
  const start = fit.seasonal ? seasonalPeriod : 1;
  const residuals = fit.residuals.slice(start);
  const rmse = Math.sqrt(mean(residuals.map((value) => value ** 2)));
  const percentageErrors = residuals.map((value, index) => values[index + start] > 0 ? Math.abs(value) / values[index + start] : null).filter(Number.isFinite);
  const mape = percentageErrors.length ? mean(percentageErrors) * 100 : null;
  const forecast = Array.from({ length: horizon }, (_, index) => {
    const seasonal = fit.seasons ? fit.seasons[(values.length + index) % seasonalPeriod] || 0 : 0;
    return Math.max(0, fit.level + (index + 1) * fit.trend + seasonal);
  });
  const lower95 = forecast.map((value, index) => Math.max(0, value - confidenceZ * rmse * Math.sqrt(index + 1)));
  const upper95 = forecast.map((value, index) => value + confidenceZ * rmse * Math.sqrt(index + 1));
  return {
    method: fit.seasonal ? "holt_winters_additive" : "holt_linear",
    status: values.length >= 3 ? "ok" : "limited_history",
    observations: values.length,
    fitted: fit.fitted.map((value) => Math.max(0, value)),
    forecast,
    lower95,
    upper95,
    points: forecast.map((value, index) => ({ period: index + 1, value, lower: lower95[index], upper: upper95[index] })),
    rmse,
    mape,
    seasonalPeriod: fit.seasonal ? seasonalPeriod : null,
    params: { smoothing_level: fit.alpha, smoothing_trend: fit.beta, ...(fit.gamma === null ? {} : { smoothing_seasonal: fit.gamma }) },
  };
}

export function reorderRecommendation(forecastResult, currentSoh, leadTimePeriods, safetyFactor = 1.15) {
  const periods = Math.max(1, Math.round(leadTimePeriods));
  const averageForecastDemand = mean(forecastResult.forecast.slice(0, periods));
  const demandDuringLeadTime = averageForecastDemand * leadTimePeriods;
  const reorderPoint = demandDuringLeadTime * safetyFactor;
  return { reorderPoint, recommendedOrderQty: Math.max(0, reorderPoint - Number(currentSoh || 0)), demandDuringLeadTime, currentSoh: Number(currentSoh || 0) };
}
