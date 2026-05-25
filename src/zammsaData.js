export const reports = [
  {
    "key": "2026-03-31",
    "label": "31 March 2026",
    "short": "31 Mar"
  },
  {
    "key": "2026-04-15",
    "label": "15 April 2026",
    "short": "15 Apr"
  },
  {
    "key": "2026-04-30",
    "label": "30 April 2026",
    "short": "30 Apr"
  },
  {
    "key": "2026-05-15",
    "label": "15 May 2026",
    "short": "15 May"
  }
];
export const trend = [
  {
    "key": "2026-03-31",
    "label": "31 March 2026",
    "short": "31 Mar",
    "total": 521,
    "critical": 31,
    "near": 68,
    "over": 19,
    "gaps": 210,
    "amiMissing": 209,
    "tbdMos": 210
  },
  {
    "key": "2026-04-15",
    "label": "15 April 2026",
    "short": "15 Apr",
    "total": 538,
    "critical": 81,
    "near": 79,
    "over": 31,
    "gaps": 123,
    "amiMissing": 120,
    "tbdMos": 123
  },
  {
    "key": "2026-04-30",
    "label": "30 April 2026",
    "short": "30 Apr",
    "total": 539,
    "critical": 56,
    "near": 72,
    "over": 34,
    "gaps": 169,
    "amiMissing": 167,
    "tbdMos": 169
  },
  {
    "key": "2026-05-15",
    "label": "15 May 2026",
    "short": "15 May",
    "total": 694,
    "critical": 58,
    "near": 76,
    "over": 31,
    "gaps": 284,
    "amiMissing": 284,
    "tbdMos": 284
  }
];
export const programmePressure = {
  "2026-03-31": [
    {
      "label": "Anaesthetics",
      "value": 15,
      "tone": "red"
    },
    {
      "label": "Laboratory",
      "value": 15,
      "tone": "red"
    },
    {
      "label": "Essential Medicines",
      "value": 11,
      "tone": "amber"
    },
    {
      "label": "Renal",
      "value": 9,
      "tone": "amber"
    },
    {
      "label": "Anti-TB",
      "value": 7,
      "tone": "red"
    },
    {
      "label": "PPE",
      "value": 7,
      "tone": "amber"
    },
    {
      "label": "Medical/Surgical",
      "value": 7,
      "tone": "amber"
    },
    {
      "label": "Anti-malarials",
      "value": 6,
      "tone": "red"
    }
  ],
  "2026-04-15": [
    {
      "label": "Essential Medicines",
      "value": 28,
      "tone": "amber"
    },
    {
      "label": "Anaesthetics",
      "value": 26,
      "tone": "red"
    },
    {
      "label": "Renal",
      "value": 15,
      "tone": "amber"
    },
    {
      "label": "Laboratory",
      "value": 15,
      "tone": "red"
    },
    {
      "label": "PPE",
      "value": 11,
      "tone": "amber"
    },
    {
      "label": "Anti-TB",
      "value": 11,
      "tone": "red"
    },
    {
      "label": "ARV",
      "value": 7,
      "tone": "amber"
    },
    {
      "label": "Cardiovascular",
      "value": 6,
      "tone": "red"
    }
  ],
  "2026-04-30": [
    {
      "label": "Anaesthetics",
      "value": 25,
      "tone": "red"
    },
    {
      "label": "Laboratory",
      "value": 14,
      "tone": "red"
    },
    {
      "label": "Essential Medicines",
      "value": 12,
      "tone": "amber"
    },
    {
      "label": "Renal",
      "value": 11,
      "tone": "amber"
    },
    {
      "label": "Anti-TB",
      "value": 11,
      "tone": "red"
    },
    {
      "label": "PPE",
      "value": 9,
      "tone": "amber"
    },
    {
      "label": "Cardiovascular",
      "value": 7,
      "tone": "red"
    },
    {
      "label": "IV Fluids",
      "value": 6,
      "tone": "red"
    }
  ],
  "2026-05-15": [
    {
      "label": "Essential Medicines",
      "value": 29,
      "tone": "red"
    },
    {
      "label": "Laboratory",
      "value": 24,
      "tone": "red"
    },
    {
      "label": "Anaesthetics",
      "value": 22,
      "tone": "red"
    },
    {
      "label": "Anti-TB",
      "value": 10,
      "tone": "red"
    },
    {
      "label": "Renal",
      "value": 7,
      "tone": "red"
    },
    {
      "label": "Medical/Surgical",
      "value": 6,
      "tone": "red"
    },
    {
      "label": "Cardiovascular",
      "value": 5,
      "tone": "red"
    },
    {
      "label": "PPE",
      "value": 4,
      "tone": "red"
    },
    {
      "label": "Anti-malarials",
      "value": 4,
      "tone": "red"
    },
    {
      "label": "Anticonvulsants",
      "value": 3,
      "tone": "red"
    }
  ]
};
export const categories = [
  "ARV",
  "Anaesthetics",
  "Anti-TB",
  "Anti-cancer",
  "Anti-infective",
  "Anti-malarials",
  "Anticonvulsants",
  "Cardiovascular",
  "Diabetes",
  "Essential Medicines",
  "Gastrointestinal",
  "IV Fluids",
  "Laboratory",
  "Medical/Surgical",
  "Mental Health",
  "Ophthalmic",
  "PPE",
  "Renal",
  "Reproductive Health"
];
export const managementConcerns = [
  {
    "title": "Persistent stockouts",
    "severity": "High",
    "tone": "red",
    "programme": "Cross-programme",
    "evidence": "54 commodities were stocked out or near-zero in at least two reports. Examples: Endotracheal Tube cuffed 4.0mm(25); Endotracheal Tube cuffed 4.5mm(25); Endotracheal Tube 5.0mm Cuffed Disp Sterile (20); Artemether + Lumefantrine 20/120mg 6's tab (30).",
    "action": "Keep these in the emergency procurement and allocation review until two consecutive reports show recovery."
  },
  {
    "title": "Deteriorating supply",
    "severity": "High",
    "tone": "amber",
    "programme": "Latest movement",
    "evidence": "8 tracked commodities worsened into a risk state by the latest report. Examples: Endotracheal Tube cuffed 5.0mm(25); Bisoprolol 5mg Tablet (100); Zidovudine/Lamivudine Dispersable 60/30mg Tablet(60); Co-Trimoxazole suspension 240mg/5ml, 100ml Bottle (1).",
    "action": "Review supplier delivery status and expected receipt dates before the next biweekly submission."
  },
  {
    "title": "Programme risk areas",
    "severity": "High",
    "tone": "red",
    "programme": "Anaesthetics, Laboratory, Anti-TB, Cardiovascular, Anti-malarials",
    "evidence": "Latest programme pressure on 15 May 2026 is concentrated in Essential Medicines (29), Laboratory (24), Anaesthetics (22), Anti-TB (10), Renal (7).",
    "action": "Use programme-level review meetings to separate procurement delays, distribution issues, and forecasting gaps."
  },
  {
    "title": "Extreme overstock",
    "severity": "Medium",
    "tone": "blue",
    "programme": "Forecasting and storage",
    "evidence": "5 latest commodities exceed 100 MOS. Top examples: Lamotrigine Tablet 50mg(30) (1,954 MOS); Syringe 1ml auto disable, 22G DMPA IM/Norethisterone (200) (1,132 MOS); Levothyroxine Sodium 200mcg /vial, 5ml (1) (734 MOS); Insulin Soluble Short Acting 100iu,10ml Inj(1) (287 MOS); Clomiphene Citrate 50mg Tablet (20) (265 MOS).",
    "action": "Pause fresh orders, check expiry exposure, and consider redistribution or forecast correction."
  },
  {
    "title": "AMI and TBD gaps",
    "severity": "Data Quality",
    "tone": "neutral",
    "programme": "Reporting quality",
    "evidence": "Latest data-quality split: 284 rows have missing AMI and 284 rows have TBD MOS. These overlap in the 15 May extract, so treat them as linked work queues rather than additive totals.",
    "action": "Assign ownership for AMI completion and require TBD MOS confirmation in the next reporting cycle."
  },
  {
    "title": "Volatile reporting base",
    "severity": "Data Quality",
    "tone": "neutral",
    "programme": "Master data",
    "evidence": "188 commodity codes do not appear consistently across all three reports.",
    "action": "Reconcile item master changes so trend movements are not confused with reporting coverage changes."
  }
];
export const commodityHistory = [
  {
    "code": "MS2967",
    "item": "Endotracheal Tube cuffed 4.0mm(25)",
    "category": "Anaesthetics",
    "mos": [
      0,
      0,
      0
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "MS2968",
    "item": "Endotracheal Tube cuffed 4.5mm(25)",
    "category": "Anaesthetics",
    "mos": [
      0.1,
      0.1,
      0.1
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "MS3057",
    "item": "Endotracheal Tube 5.0mm Cuffed Disp Sterile (20)",
    "category": "Anaesthetics",
    "mos": [
      0,
      0,
      0
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "MAL0001",
    "item": "Artemether + Lumefantrine 20/120mg 6's tab (30)",
    "category": "Anti-malarials",
    "mos": [
      0.1,
      0,
      0
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "TB0072",
    "item": "Moxifloxacin 400mg Tablet (100)",
    "category": "Anti-TB",
    "mos": [
      0.1,
      0,
      0
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "EM4085",
    "item": "Anti-D Immunoglobulin for IV Injection 300mcg (RT) (1)",
    "category": "Reproductive Health",
    "mos": [
      0.1,
      0.1,
      0.1
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "RH0026",
    "item": "Levonorgestrel 1.5mg tab (Emergency pill) (10)",
    "category": "Reproductive Health",
    "mos": [
      0,
      0,
      0
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "EM2367",
    "item": "Aluminium hydroxide + Magnesium trisilicate 250mg/125mg /5ml suspension 100ml (1)",
    "category": "Gastrointestinal",
    "mos": [
      0.1,
      0.1,
      0.1
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "EM1595",
    "item": "Esomeprazole Sodium Powder 40mg/10ml injection (1)",
    "category": "Gastrointestinal",
    "mos": [
      0.1,
      0.1,
      0
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "MS0132",
    "item": "Cannulae I.V 18G,Disposable (100)",
    "category": "Medical/Surgical",
    "mos": [
      0.1,
      0.1,
      0.1
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "MS0067",
    "item": "Needle Luer 21G x 1.5 Disposable (100)",
    "category": "Medical/Surgical",
    "mos": [
      0,
      0,
      0
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "MS3022",
    "item": "Syringe 5ml with Needle, 22G (120)",
    "category": "Medical/Surgical",
    "mos": [
      0.1,
      0.1,
      0.1
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "MS2618",
    "item": "Disposable Surgical Face Mask (10)",
    "category": "PPE",
    "mos": [
      0,
      0,
      0
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "PC0018",
    "item": "Gumboots Size 8 Pair (1)",
    "category": "PPE",
    "mos": [
      0.06,
      0.06,
      0.1
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "MS1895",
    "item": "Adult I-gel, with thermoplastic elastomer noninflatable cuff, size 4 (1)",
    "category": "Anaesthetics",
    "mos": [
      0.1,
      0.1,
      null
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "MS1896",
    "item": "Adult I-gel, with thermoplastic elastomer noninflatable cuff, size 5 (1)",
    "category": "Anaesthetics",
    "mos": [
      0.1,
      0.1,
      null
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "MS1200",
    "item": "Central Line Adult Trio 7Fr, 20cm (1)",
    "category": "Anaesthetics",
    "mos": [
      null,
      0,
      0
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "MS1993",
    "item": "Central Line Adult Trio 8.5Fr, 20cm (1)",
    "category": "Anaesthetics",
    "mos": [
      null,
      0,
      0
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "MS1997",
    "item": "Central Line Pediatric Trio 4.5Fr, 20cm (1)",
    "category": "Anaesthetics",
    "mos": [
      null,
      0,
      0
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "MS2004",
    "item": "Central Line Pediatric Trio 5.5Fr, 20cm (1)",
    "category": "Anaesthetics",
    "mos": [
      null,
      0,
      0
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "EM0912",
    "item": "Sodium Valproate 200mg/5ml Suspension (1)",
    "category": "Anticonvulsants",
    "mos": [
      0.2,
      0.1,
      0.1
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "EM0397",
    "item": "Propranolol Hydrochloride 40mg Tablet (1000)",
    "category": "Cardiovascular",
    "mos": [
      null,
      0,
      0
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "EM2369",
    "item": "Labetalol HCL Injection, 5mg/ml, 4ml Amp (5)",
    "category": "Cardiovascular",
    "mos": [
      null,
      0,
      0
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "EM3052",
    "item": "Dextrose 5% + Sodium Chloride 0.9% Infusion 250ML(24)",
    "category": "IV Fluids",
    "mos": [
      null,
      0,
      0
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "MAL0003",
    "item": "Artemether + Lumefantrine 20/120mg 18's tab (30)",
    "category": "Anti-malarials",
    "mos": [
      0.7,
      0.2,
      0
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "TB0118",
    "item": "Clofazimine 50mg Tablet (100)",
    "category": "Anti-TB",
    "mos": [
      null,
      0,
      0
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "TB0112",
    "item": "Delamanid 50mg Tablet(48)",
    "category": "Anti-TB",
    "mos": [
      null,
      0.1,
      0.1
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "TB0104",
    "item": "Linezolid 600mg Tablet (100)",
    "category": "Anti-TB",
    "mos": [
      null,
      0,
      0
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "TB0120",
    "item": "Linezolid tablet 150mg (100)",
    "category": "Anti-TB",
    "mos": [
      null,
      0,
      0
    ],
    "present": [
      true,
      true,
      true
    ]
  },
  {
    "code": "RN0034",
    "item": "Fresenius: CAPD Disinfectant Cap SS (1)",
    "category": "Renal",
    "mos": [
      0.2,
      0.1,
      0.1
    ],
    "present": [
      true,
      true,
      true
    ]
  }
];
