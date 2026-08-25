import { tracerReportingPeriods as tracerFacilityDataJanFeb } from "./tracerFacilityDataJanFeb.js";
import { tracerReportingPeriods as tracerFacilityDataMarApr } from "./tracerFacilityDataMarApr.js";
import { tracerReportingPeriods as tracerFacilityDataMayJun } from "./tracerFacilityDataMayJun.js";
import { tracerReportingPeriods as tracerFacilityDataJul } from "./tracerFacilityDataJul.js";

export const tracerReportingPeriods = [...tracerFacilityDataJanFeb, ...tracerFacilityDataMarApr, ...tracerFacilityDataMayJun, ...tracerFacilityDataJul];

export const tracerFacilityData = tracerReportingPeriods.at(-1);
