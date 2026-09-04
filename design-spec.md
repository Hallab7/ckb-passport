{
  "meta": {
    "project": "AttestCKB",
    "style": "Luxury financial publication meets modern fintech",
    "design_principles": [
      "Typography-first",
      "Minimal monochrome",
      "Data as design",
      "High whitespace",
      "Strong grid discipline",
      "Premium institutional feel"
    ]
  },

  "layout": {
    "type": "Editorial Dashboard Landing",

    "structure": [
      "Announcement Bar",
      "Navigation",
      "Live Metrics Grid",
      "Feature Editorial",
      "Product Showcase",
      "Trust Section",
      "Footer"
    ],

    "viewport_behavior": {
      "desktop": "Magazine-style composition",
      "tablet": "Compressed editorial layout",
      "mobile": "Stacked content blocks"
    }
  },

  "color_system": {
    "primary": {
      "50": "#F8F8F8",
      "100": "#EAEAEA",
      "200": "#D6D6D6",
      "300": "#B0B0B0",
      "400": "#808080",
      "500": "#5A5A5A",
      "600": "#3D3D3D",
      "700": "#252525",
      "800": "#121212",
      "900": "#000000"
    },

    "secondary": {
      "50": "#FFFFFF",
      "100": "#FAFAFA",
      "200": "#F3F3F3",
      "300": "#E5E5E5",
      "400": "#CCCCCC",
      "500": "#999999",
      "600": "#666666",
      "700": "#444444",
      "800": "#222222",
      "900": "#111111"
    },

    "accent": {
      "success": "#FFFFFF",
      "warning": "#A3A3A3",
      "divider": "#262626"
    }
  },

  "dark_mode": {
    "background": "#000000",
    "surface": "#090909",
    "text_primary": "#FFFFFF",
    "text_secondary": "#9D9D9D",
    "border": "#1A1A1A"
  },

  "light_mode": {
    "background": "#FFFFFF",
    "surface": "#F8F8F8",
    "text_primary": "#000000",
    "text_secondary": "#555555",
    "border": "#E8E8E8"
  },

  "navigation": {
    "height": "88px",

    "layout": {
      "left": "Wordmark",
      "center": "Links",
      "right": "Account Actions"
    },

    "style": {
      "background": "transparent",
      "border_bottom": "1px subtle divider"
    }
  },

  "hero": {
    "layout": "Editorial",

    "composition": {
      "left": {
        "width": "65%",
        "content": [
          "eyebrow",
          "headline",
          "description",
          "cta"
        ]
      },

      "right": {
        "width": "35%",
        "content": [
          "market_snapshot",
          "account_balance",
          "daily_change"
        ]
      }
    },

    "headline": {
      "desktop": {
        "size": "128px",
        "line_height": "0.9",
        "weight": 600,
        "tracking": "-0.08em"
      },

      "tablet": {
        "size": "80px"
      },

      "mobile": {
        "size": "48px"
      }
    }
  },

  "metrics_strip": {
    "position": "Directly below hero",

    "layout": {
      "desktop": "4 columns",
      "tablet": "2 columns",
      "mobile": "1 column"
    },

    "card_style": {
      "background": "transparent",
      "border_top": "1px divider",
      "padding": "32px 0"
    },

    "content": [
      "Assets Under Management",
      "Transaction Volume",
      "Verified Accounts",
      "Countries Supported"
    ]
  },

  "feature_editorial": {
    "layout": "Asymmetric Grid",

    "left": {
      "width": "40%",
      "content": "Large statement"
    },

    "right": {
      "width": "60%",
      "content": "Feature explanation"
    },

    "divider": true
  },

  "dashboard_preview": {
    "style": "Monochrome terminal-inspired",

    "elements": [
      "Balance overview",
      "Portfolio allocation",
      "Transaction history",
      "Performance chart"
    ],

    "visual_rules": {
      "background": "Pure monochrome",
      "borders": "Thin",
      "radius": "24px",
      "shadows": "Minimal"
    }
  },

  "trust_section": {
    "layout": "Institutional",

    "elements": [
      "Compliance badges",
      "Partner logos",
      "Security certifications",
      "Coverage statistics"
    ],

    "style": {
      "background": "transparent",
      "typography": "Small uppercase labels"
    }
  },

  "typography": {
    "display": {
      "weight": 600,
      "tracking": "-0.08em"
    },

    "body": {
      "size": "18px",
      "line_height": 1.8
    },

    "caption": {
      "size": "12px",
      "uppercase": true,
      "tracking": "0.12em"
    }
  },

  "buttons": {
    "primary": {
      "dark_mode": {
        "background": "#FFFFFF",
        "text": "#000000"
      },

      "light_mode": {
        "background": "#000000",
        "text": "#FFFFFF"
      }
    },

    "secondary": {
      "background": "transparent",
      "border": "1px solid currentColor"
    }
  },

  "breakpoints": {
    "sm": "640px",
    "md": "768px",
    "lg": "1024px",
    "xl": "1280px",
    "2xl": "1536px"
  },

  "visual_identity": {
    "avoid": [
      "Color gradients",
      "Neon effects",
      "3D renders",
      "Glassmorphism",
      "Crypto-style illustrations"
    ],

    "prefer": [
      "Large typography",
      "Data visualizations",
      "Editorial spacing",
      "Thin dividers",
      "Institutional layouts",
      "Black and white photography"
    ]
  }
}