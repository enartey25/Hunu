import { containsPhrase, contentTokens, normalizeText, tokenize } from './text';

export interface ProductRecommendation {
  name: string;
  note: string;
  suggestedQuery: string;
  category: string;
}

const CATALOG_RECOMMENDATIONS: {
  triggers: string[];
  recommendations: ProductRecommendation[];
}[] = [
  {
    triggers: ['arduino', 'uno', 'microcontroller', 'development board'],
    recommendations: [
      {
        name: 'ESP32 NodeMCU Dev Board',
        note: 'Dual-core 240MHz with built-in Wi-Fi & Bluetooth, lower unit cost for IoT and robotics',
        suggestedQuery: 'ESP32 NodeMCU development board',
        category: 'Lab Components & Hardware'
      },
      {
        name: 'Arduino Nano (ATmega328P)',
        note: 'Compact breadboard-friendly form factor with the identical ATmega328P architecture',
        suggestedQuery: 'Arduino Nano ATmega328P',
        category: 'Lab Components & Hardware'
      },
      {
        name: 'Raspberry Pi Pico (RP2040)',
        note: 'Dual-core ARM Cortex-M0+ with 264KB SRAM, programmable in MicroPython and C++',
        suggestedQuery: 'Raspberry Pi Pico RP2040',
        category: 'Lab Components & Hardware'
      }
    ]
  },
  {
    triggers: ['stm32', 'arm', 'nucleo', 'cortex'],
    recommendations: [
      {
        name: 'STM32F103C8T6 (Blue Pill)',
        note: 'Standard 72MHz ARM Cortex-M3 board widely supported in engineering courses',
        suggestedQuery: 'STM32F103C8T6 Blue Pill',
        category: 'Lab Components & Hardware'
      },
      {
        name: 'ESP32-S3 DevKit',
        note: 'Dual-core Xtensa LX7 with vector instructions for edge machine learning',
        suggestedQuery: 'ESP32-S3 DevKit',
        category: 'Lab Components & Hardware'
      },
      {
        name: 'Arduino Uno R4 Minima',
        note: '32-bit Renesas RA4M1 ARM Cortex-M4 running at 48MHz with 256KB flash',
        suggestedQuery: 'Arduino Uno R4 Minima',
        category: 'Lab Components & Hardware'
      }
    ]
  },
  {
    triggers: ['raspberry pi', 'sbc', 'single board computer', 'linux board'],
    recommendations: [
      {
        name: 'Orange Pi Zero 3',
        note: 'Quad-core Allwinner H618 Linux single-board computer with gigabit ethernet',
        suggestedQuery: 'Orange Pi Zero 3',
        category: 'Lab Components & Hardware'
      },
      {
        name: 'Raspberry Pi Pico W',
        note: 'Low-power microcontroller with wireless connectivity for lightweight sensor nodes',
        suggestedQuery: 'Raspberry Pi Pico W',
        category: 'Lab Components & Hardware'
      },
      {
        name: 'Libre Computer Le Potato',
        note: 'Quad-core 64-bit ARM single-board computer compatible with standard Linux distros',
        suggestedQuery: 'Libre Computer Le Potato',
        category: 'Lab Components & Hardware'
      }
    ]
  },
  {
    triggers: ['sensor', 'temperature', 'humidity', 'accelerometer', 'ultrasonic'],
    recommendations: [
      {
        name: 'DHT22 / AM2302 Sensor',
        note: 'Higher-accuracy digital temperature and humidity sensor module with 0.1C resolution',
        suggestedQuery: 'DHT22 AM2302 sensor module',
        category: 'Lab Components & Hardware'
      },
      {
        name: 'BMP280 Barometric Pressure Sensor',
        note: 'High-precision atmospheric pressure & altitude sensor via I2C / SPI',
        suggestedQuery: 'BMP280 sensor module',
        category: 'Lab Components & Hardware'
      },
      {
        name: 'HC-SR04 Ultrasonic Distance Sensor',
        note: 'Non-contact distance measurement module (2cm to 400cm)',
        suggestedQuery: 'HC-SR04 ultrasonic sensor',
        category: 'Lab Components & Hardware'
      }
    ]
  },
  {
    triggers: ['pcb', 'fabrication', 'prototyping', 'smt', 'soldering'],
    recommendations: [
      {
        name: 'Double-Sided FR4 Prototype Boards',
        note: 'Solderable universal perfboards for rapid lab circuit assembly without custom etching',
        suggestedQuery: 'double sided FR4 prototype perfboard',
        category: 'Lab Components & Hardware'
      },
      {
        name: 'Solderless 830-Tie Point Breadboard',
        note: 'Full-size prototyping board with independent power rails',
        suggestedQuery: '830 tie point solderless breadboard',
        category: 'Lab Components & Hardware'
      }
    ]
  },
  {
    triggers: ['flight', 'airline', 'travel', 'airfare'],
    recommendations: [
      {
        name: 'Mid-Week Travel Timing',
        note: 'Departing on Tuesday or Wednesday typically lowers transatlantic/intercontinental airfares by 15-25%',
        suggestedQuery: 'student flight discounts mid week',
        category: 'Student Flights & Travel'
      },
      {
        name: 'Regional Connecting Hubs',
        note: 'Check alternate European or Middle Eastern transit hubs (e.g. Casablanca, Doha, Amsterdam) for lower rates',
        suggestedQuery: 'international student airfare deals',
        category: 'Student Flights & Travel'
      }
    ]
  },
  {
    triggers: ['freight', 'ocean', 'cargo', 'customs', 'logistics', 'shipping'],
    recommendations: [
      {
        name: 'LCL (Less than Container Load)',
        note: 'Shared container space consolidation, best for shipments under 15 CBM to avoid full container rates',
        suggestedQuery: 'LCL consolidated ocean freight',
        category: 'Supply Chain & Bulk Freight'
      },
      {
        name: 'Air Cargo Consolidation',
        note: 'Scheduled consolidation for high-value components requiring 3-5 day transit',
        suggestedQuery: 'air freight consolidation',
        category: 'Supply Chain & Bulk Freight'
      }
    ]
  },
  {
    triggers: ['esp32', 'esp8266', 'nodemcu', 'wifi module', 'iot board'],
    recommendations: [
      {
        name: 'ESP32-C3 Mini',
        note: 'Single-core RISC-V with Wi-Fi and Bluetooth LE, usually the lowest-cost ESP32 variant',
        suggestedQuery: 'ESP32-C3 mini development board',
        category: 'Lab Components & Hardware'
      },
      {
        name: 'Raspberry Pi Pico W',
        note: 'RP2040 with Wi-Fi, programmable in MicroPython and C',
        suggestedQuery: 'Raspberry Pi Pico W',
        category: 'Lab Components & Hardware'
      },
      {
        name: 'ESP8266 NodeMCU',
        note: 'Older single-core Wi-Fi board, enough for simple sensor nodes',
        suggestedQuery: 'ESP8266 NodeMCU',
        category: 'Lab Components & Hardware'
      }
    ]
  },
  {
    triggers: ['multimeter', 'oscilloscope', 'logic analyzer', 'bench power supply', 'test equipment'],
    recommendations: [
      {
        name: 'Handheld digital oscilloscope',
        note: 'Pocket single-channel scopes cover audio and low-speed digital work at a fraction of a bench unit',
        suggestedQuery: 'handheld digital oscilloscope',
        category: 'Lab Components & Hardware'
      },
      {
        name: 'USB logic analyzer (8 channel)',
        note: 'Decodes I2C, SPI and UART on a laptop, which is often what a digital lab needs',
        suggestedQuery: 'USB logic analyzer 8 channel 24MHz',
        category: 'Lab Components & Hardware'
      },
      {
        name: 'Auto-ranging digital multimeter',
        note: 'Covers voltage, current, resistance and continuity for most coursework',
        suggestedQuery: 'auto ranging digital multimeter',
        category: 'Lab Components & Hardware'
      }
    ]
  },
  {
    triggers: ['resistor', 'capacitor', 'led', 'transistor', 'diode', 'jumper wires', 'component kit'],
    recommendations: [
      {
        name: 'Assorted resistor kit',
        note: 'A boxed assortment of common values costs less than buying values one at a time',
        suggestedQuery: 'resistor assortment kit 1/4W',
        category: 'Lab Components & Hardware'
      },
      {
        name: 'Electronics starter component kit',
        note: 'Resistors, capacitors, LEDs, transistors and jumpers in one pack',
        suggestedQuery: 'electronics component starter kit',
        category: 'Lab Components & Hardware'
      }
    ]
  },
  {
    triggers: ['laptop', 'notebook computer', 'macbook', 'thinkpad', 'chromebook', 'ultrabook'],
    recommendations: [
      {
        name: 'Refurbished business laptop',
        note: 'Off-lease business models are sold refurbished with warranty, well below new prices',
        suggestedQuery: 'refurbished business laptop',
        category: 'General Products & Retail'
      },
      {
        name: 'Chromebook',
        note: 'Enough for browser-based coursework and documents at a lower price',
        suggestedQuery: 'Chromebook',
        category: 'General Products & Retail'
      },
      {
        name: 'Education store pricing',
        note: 'Major laptop makers run education stores with student pricing',
        suggestedQuery: 'laptop student discount education store',
        category: 'General Products & Retail'
      }
    ]
  },
  {
    triggers: ['phone', 'smartphone', 'iphone', 'galaxy', 'pixel', 'android phone'],
    recommendations: [
      {
        name: 'Refurbished or renewed model',
        note: 'Graded refurbished phones carry a warranty and cost less than new',
        suggestedQuery: 'refurbished smartphone',
        category: 'General Products & Retail'
      },
      {
        name: 'Previous-generation model',
        note: 'The outgoing model usually drops in price when its successor launches',
        suggestedQuery: 'previous generation smartphone price',
        category: 'General Products & Retail'
      }
    ]
  },
  {
    triggers: ['textbook', 'book', 'ebook', 'course book'],
    recommendations: [
      {
        name: 'Used or international edition',
        note: 'Same content as the current edition in most courses, at a lower price',
        suggestedQuery: 'used textbook international edition',
        category: 'General Products & Retail'
      },
      {
        name: 'Textbook rental',
        note: 'Renting for a semester costs less than buying when the book is not needed afterwards',
        suggestedQuery: 'textbook rental',
        category: 'General Products & Retail'
      }
    ]
  },
  {
    triggers: ['warehouse', 'warehousing', '3pl', 'fulfillment', 'storage space'],
    recommendations: [
      {
        name: 'Shared or on-demand warehousing',
        note: 'Pay per pallet per month instead of leasing a whole unit',
        suggestedQuery: 'on-demand shared warehousing',
        category: '3PL Warehousing & Logistics'
      },
      {
        name: 'Fulfillment with no minimums',
        note: 'Some 3PL providers charge per order with no monthly minimum, suited to low volumes',
        suggestedQuery: '3PL fulfillment no minimum order',
        category: '3PL Warehousing & Logistics'
      }
    ]
  },
  {
    triggers: ['payroll', 'hr software', 'human resources', 'accounting software', 'bookkeeping'],
    recommendations: [
      {
        name: 'Free-tier tools',
        note: 'Several accounting and HR tools have a free tier for very small teams',
        suggestedQuery: 'free accounting software small business',
        category: 'Accounting & Tax'
      },
      {
        name: 'Regional provider',
        note: 'A provider registered in your country handles local tax filings that global tools may not',
        suggestedQuery: 'payroll provider local tax filing',
        category: 'Payroll & HR'
      }
    ]
  }
];

/**
 * Returns alternatives worth searching for: compatible or comparable products, and
 * cheaper ways to buy the same thing.
 *
 * Every knowledge-base entry is scored by how many of its trigger terms occur in the
 * query as whole words (so "arm" does not fire on "pharmacy"), with multi-word and
 * longer triggers counting more. The best entry wins and a close second contributes.
 * Suggestions that merely repeat the query are dropped.
 */
export function getSimilarProductRecommendations(
  searchQuery?: string,
  category?: string
): ProductRecommendation[] {
  const query = (searchQuery || '').trim();
  if (query.length < 2) return [];

  const tokens = tokenize(query);
  const querySubject = new Set(contentTokens(query));

  const scored = CATALOG_RECOMMENDATIONS.map((entry) => {
    let score = 0;
    for (const trigger of entry.triggers) {
      if (containsPhrase(tokens, trigger)) {
        score += trigger.includes(' ') ? 3 : 1 + Math.min(1, trigger.length / 10);
      }
    }
    return { entry, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const picked: ProductRecommendation[] = [];
  const add = (recs: ProductRecommendation[]) => {
    for (const rec of recs) {
      // Skip a suggestion that is the thing already being searched for.
      const recTokens = contentTokens(rec.suggestedQuery);
      const same = recTokens.length > 0 && recTokens.every((t) => querySubject.has(t));
      if (same || picked.some((p) => p.suggestedQuery === rec.suggestedQuery)) continue;
      picked.push(rec);
    }
  };

  if (scored.length > 0) {
    add(scored[0].entry.recommendations);
    if (scored.length > 1 && scored[1].score >= scored[0].score * 0.75) {
      add(scored[1].entry.recommendations);
    }
    return picked.slice(0, 4);
  }

  // Nothing in the knowledge base names this product. If its category is known, offer
  // that category's alternatives.
  if (category && category !== 'General Products & Retail') {
    const entry = CATALOG_RECOMMENDATIONS.find((e) =>
      e.recommendations.some((r) => r.category === category)
    );
    if (entry) return entry.recommendations.slice(0, 2);
  }

  return getQueryRefinements(query);
}

/**
 * Cheaper ways to buy the same product. These are searches, not claims: each one
 * rephrases the user's own query toward a channel that usually costs less.
 */
export function getQueryRefinements(searchQuery: string): ProductRecommendation[] {
  const core = normalizeText(searchQuery)
    .split(' ')
    .filter((w) => contentTokens(w).length > 0)
    .join(' ');
  if (!core || /\b(refurbished|used|wholesale)\b/.test(normalizeText(searchQuery))) return [];
  return [
    {
      name: `Refurbished ${core}`,
      note: 'Refurbished and open-box units are usually priced below new',
      suggestedQuery: `refurbished ${core}`,
      category: 'General Products & Retail'
    },
    {
      name: `Used ${core}`,
      note: 'Second-hand listings from individuals and resellers',
      suggestedQuery: `used ${core}`,
      category: 'General Products & Retail'
    },
    {
      name: `${core} wholesale`,
      note: 'Suppliers and distributors that sell in quantity',
      suggestedQuery: `${core} wholesale supplier`,
      category: 'General Products & Retail'
    }
  ];
}

