import { tracerReportingPeriods as tracerFacilityData2024 } from "./tracerFacilityData2024.js";
import { tracerReportingPeriods as tracerFacilityDataJanFeb } from "./tracerFacilityDataJanFeb.js";
import { tracerReportingPeriods as tracerFacilityDataMarApr } from "./tracerFacilityDataMarApr.js";
import { tracerReportingPeriods as tracerFacilityDataMayJun } from "./tracerFacilityDataMayJun.js";
import { tracerReportingPeriods as tracerFacilityDataJul } from "./tracerFacilityDataJul.js";

export const tracerReportingPeriods = [...tracerFacilityData2024, ...tracerFacilityDataJanFeb, ...tracerFacilityDataMarApr, ...tracerFacilityDataMayJun, ...tracerFacilityDataJul];

export const tracerFacilityData = tracerReportingPeriods.at(-1);
