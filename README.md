# PV Array Shade Simulator v2

Interactive browser-based shade simulator for a **3 × 9 Lucksolar LS-MD120-340W** array
(27 panels, ~9.18 kWp).  
Drag a shade region over the array and watch the I–V curve, P–V curve, and power output
update in real time across **five wiring configurations**.

---

## Quick start – run locally

No build step or server required. Open the file directly in a modern browser:

```bash
# clone the repo (if you haven't already)
git clone https://github.com/joostmoesker-sys/shade-simulatorv2.git
cd shade-simulatorv2

# open in your default browser
# macOS
open index.html
# Linux
xdg-open index.html
# Windows (PowerShell)
start index.html
```

Alternatively, open `index.html` from your file manager.

> **Note:** The simulator uses no external libraries — all charts are drawn with the built-in
> Canvas 2D API. The file works completely offline after download.

---

## How to use

| Action | Effect |
|--------|--------|
| **Drag** over the panel grid | Adds a shade region |
| **Right-click** on the grid | Clears shade immediately |
| **Clear Shade** button | Also clears shade |
| **Config buttons (1–5)** | Switch wiring topology; charts update instantly |

---

## Panel specification

**Lucksolar LS-MD120-340W** at STC (1000 W/m², 25 °C, AM 1.5):

| Parameter | Value |
|-----------|-------|
| Peak power Pmax | 340 W |
| MPP voltage Vmp | 33.6 V |
| MPP current Imp | 10.12 A |
| Open-circuit voltage Voc | 40.8 V |
| Short-circuit current Isc | 10.45 A |
| Bypass diodes | 3 (one per zone) |

---

## Wiring configurations

| # | Name | MPPTs | Description |
|---|------|-------|-------------|
| **1** | SP 3×9 | 1 | Three parallel strings of 9 series panels each |
| **2** | TCT 3×9 | 1 | Full 3×9 Total Cross-Tie — every row tied together |
| **3** | 3 × string | 3 | Each row (9 panels) connected to its own MPPT |
| **4** | 3×3 TCT landscape | 3 | Array split into three 3×3 TCT blocks; panels in landscape (bypass zones = vertical strips) |
| **5** | 3×3 TCT portrait | 3 | Same three 3×3 TCT blocks; panels in portrait (bypass zones = horizontal strips) |

For configurations 3–5 the simulator computes each MPPT independently and reports the
sum of the three MPP powers as total output.

---

## Physics model

Each panel is modelled as **three bypass-diode zones in series** (single-diode model
per zone, no series/shunt resistance).  

Zone thermal voltage `VT = 0.692 V` is fitted to reproduce the datasheet Voc and Vmp
simultaneously.  Saturation current `I₀ ≈ 3.05 × 10⁻⁸ A` follows from the open-circuit
condition.

**Zone irradiance** is the fraction of each zone area *not* covered by the shade
rectangle.  Partial shading within a zone produces proportionally reduced photocurrent,
causing that zone's bypass diode to activate at lower string currents.

IV curves are computed by:
- **SP topology** – voltage sweep; current found by bisection per string.
- **TCT topology** – current sweep; row voltage found via pre-built panel lookup
  tables + bisection, avoiding nested root-finding.

---

## Files

```
index.html   – complete single-file application (HTML + CSS + JavaScript)
README.md    – this file
```
