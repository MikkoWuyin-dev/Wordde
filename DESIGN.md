---
name: Wordde
description: Offline-first Bible projection for church services — a broadcast console that runs on one volunteer's laptop
colors:
  black-ground: "hsl(240 11% 3%)"
  background: "hsl(240 10% 4%)"
  background-elevated: "hsl(240 9% 6%)"
  card: "hsl(240 8% 7%)"
  popover: "hsl(240 9% 8%)"
  secondary: "hsl(240 7% 12%)"
  muted: "hsl(240 6% 14%)"
  muted-foreground: "hsl(240 5% 62%)"
  foreground: "hsl(0 0% 96%)"
  paprika: "hsl(14 77% 54%)"
  paprika-bright: "hsl(14 85% 68%)"
  paprika-foreground: "hsl(240 11% 7%)"
  hunter: "hsl(134 31% 29%)"
  hunter-bright: "hsl(134 30% 70%)"
  hunter-foreground: "hsl(0 0% 98%)"
  snow: "hsl(0 0% 99%)"
  snow-soft: "hsl(0 0% 88%)"
  yellow: "hsl(60 100% 50%)"
  yellow-foreground: "hsl(240 11% 6%)"
  destructive: "hsl(0 72% 56%)"
  border: "hsl(240 7% 16%)"
typography:
  display:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "auto-fit 16–72px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.01em"
  headline:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.05em"
    fontFeature: "uppercase by convention"
  scripture-reference:
    fontFamily: "Poppins, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.08em"
  wordmark:
    fontFamily: "Autography, cursive"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
    fontFeature: "header wordmark only"
  mono:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "0.7rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
    fontFeature: "kbd caps and numeric indices only"
rounded:
  sm: "0.625rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.25rem"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.paprika}"
    textColor: "{colors.paprika-foreground}"
    rounded: "{rounded.md}"
    height: "28px"
    width: "auto"
    padding: "0 12px"
  button-primary-hover:
    backgroundColor: "hsl(14 77% 49%)"
    textColor: "{colors.paprika-foreground}"
    rounded: "{rounded.md}"
  button-outline:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "28px"
    width: "auto"
    padding: "0 12px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.md}"
    height: "28px"
    width: "auto"
    padding: "0 8px"
  chip-live:
    backgroundColor: "hsl(14 77% 54% / 0.14)"
    textColor: "{colors.paprika-bright}"
    rounded: "{rounded.md}"
    height: "28px"
    width: "auto"
    padding: "0 8px"
  input-search:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "0.75rem"
    height: "48px"
    width: "100%"
    padding: "0 40px"
  card-live:
    backgroundColor: "{colors.card}"
    textColor: "{colors.snow-soft}"
    rounded: "{rounded.xl}"
    height: "auto"
    width: "100%"
    padding: "24px"
  card-next:
    backgroundColor: "hsl(240 8% 7% / 0.6)"
    textColor: "{colors.snow-soft}"
    rounded: "{rounded.xl}"
    height: "auto"
    width: "100%"
    padding: "20px"
---

# Design System: Wordde

## Overview

**Creative North Star: "The Broadcast Console"**

Wordde's operator interface is the A/V desk at the back of a dark hall: a matte black surface where nothing glows unless it is carrying a signal. The black ground (`#08090a` family) is not a theme applied to the product — it is the product's environment, the darkened control room that lets a single lit lamp read from across the room. Every accent is an indicator lamp with a dedicated meaning: paprika for the live circuit, hunter for the prepared/standby circuit, yellow for a transitional caution blink.

Density is console-grade: compact rows (28–32px controls), tight list rhythm, and small uppercase labels acting as engraved switch legends. Expression is reserved for exactly one element at a time — the LIVE slide — which breathes with a slow paprika halo; everything else sits at rest. This is a tool read in seconds under pressure by rotating volunteers, so color encodes state before any label is parsed.

**Key Characteristics:**
- Near-neutral cool black ground with one soft radial lift of light at the top of the viewport; never a flat undifferentiated fill, never navy.
- Four accent lamps with fixed roles: paprika (live/action), hunter (prepared/secure), yellow (transitional signal only), snow (reading hierarchy).
- Console density: 28px controls, 4–6px list gaps, 10–12px uppercase tracked labels.
- One authored live moment: the breathing paprika halo on the LIVE slide. No other ambient animation.
- Serif scripture (Playfair Display) appears only where text is destined for the congregation; UI chrome is Poppins; the header wordmark is Autography.

## Colors

A near-black instrument surface carrying exactly four signal hues; everything else is a lightness ramp on the ground hue.

### Primary — Paprika (Live / Action)
- **Paprika** (hsl(14 77% 54%), the brand `#e4572e`): the single action voice. Primary buttons (Start Projection, Project Now, Add to Plan), the LIVE slide's border and halo, active tab underline, selected result ring, scripture reference lines. If it clicks to advance the service or is currently on air, it may be paprika. Nothing else may.
- **Paprika Bright** (hsl(14 85% 68%)): paprika raised in lightness for *small text on the black ground* (chip labels, 10–12px section markers, icon strokes). Base paprika at text sizes fails AA on black; bright passes ~5.5:1.
- **Paprika Foreground** (hsl(240 11% 7%)): near-black text on solid paprika fills.

### Secondary — Hunter (Prepared / Secure)
- **Hunter** (hsl(134 31% 29%), the brand `#34623f`): fills for engaged-but-safe states — the Emergency bar's border/tint, the solid Blank engage fill, "Load Full Chapter" tint.
- **Hunter Bright** (hsl(134 30% 70%)): hunter's readable voice. All hunter *text* and *icons* on the black ground (NEXT label, Lock button label, Emergency legend, selected-suggestion highlight). Base hunter as text on black is ~2.4:1 — forbidden.
- **Hunter Foreground** (hsl(0 0% 98%)): text on solid hunter fills.

### Tertiary — Yellow (Transitional Signal)
- **Yellow** (hsl(60 100% 50%), the brand `#faff00`): a caution/status lamp only — the Locked status dot, the "connecting" blink dot. Highest contrast ratio in the system (~17:1 on black), which is exactly why it must stay rare.

### Neutral — The Ground System (Cool Black → Snow)
- **Black Ground** (hsl(240 11% 3%), the brand `#08090a`): the room itself. Page canvas, projection fallback.
- **Background / Elevated / Card / Popover** (hsl(240 10% 4%) → hsl(240 9% 8%)): the litness ladder. Each step up is one instrument closer to the operator's hand.
- **Secondary / Muted** (hsl(240 7% 12%) / hsl(240 6% 14%)): hover fields, kbd caps, icon trays.
- **Muted Foreground** (hsl(240 5% 62%)): secondary text, labels at rest. Never below 62% lightness for meaningful text.
- **Snow / Snow Soft** (hsl(0 0% 99%) / hsl(0 0% 88%)): primary and secondary reading text. Scripture destined for projection is snow.
- **Border** (hsl(240 7% 16%)): 1px separators; the quietest structural voice.
- **Destructive** (hsl(0 72% 56%)): deletion confirms and disconnect states only — semantically outside the four-lamp system.

### Named Rules
**The Black Is the Room Rule.** `#08090a` is the environment, not a surface color. Cards, popovers, and panels are lamps on the console — they lighten by 3–5 lightness steps from the ground, never sit at ground level with a border pretending to be a card.

**The One Voice Rule.** Paprika speaks only for what is live or what advances the service. At most one breathing/live element on screen; if two things pulse, one of them is wrong.

**The Signal, Not the Paint Rule.** Yellow is a state signal (dots, blinks). Never yellow text paragraphs, yellow fills on large regions, or yellow decoration.

**The Bright Variant Rule.** Base paprika and hunter are for *fills, borders, and large graphic marks*. On the black ground, any accent *text or icon* below ~16px uses the `-bright` variant. This is how the system holds AA contrast without washing out the brand hues.

## Typography

**Display Font:** Playfair Display (with Georgia, serif) — scripture only
**Body Font:** Poppins (with system-ui, sans-serif) — committed UI face for all chrome, labels, and controls
**Wordmark Font:** Autography — the "Wordde" header signature only; never functional text
**Label/Mono Font:** ui-monospace stack — kbd caps and numeric indices only

**Character:** A liturgical serif reserved exclusively for the Word, set against a round geometric grotesque for the machinery around it, with a single handwritten signature reserved for the product name. All three ship self-hosted from /fonts/ — no CDN, honoring the offline sanctuary. The pairing enforces the product's core division: what the congregation sees is scripture; what the operator touches is a console; what names the product is a mark, not a label.

### Hierarchy
- **Display** (Playfair Display 400–500, auto-fit 16–72px, 1.5): LIVE/preview scripture text. Font size is computed by the auto-fitter, never hand-picked.
- **Headline** (Poppins 600, 1.25rem, -0.02em): dialog titles, screen titles.
- **Title** (Poppins 600, 0.875rem, -0.01em): card titles, service/service names, menu headers.
- **Body** (Poppins 400, 0.875rem, 1.55): list rows, descriptions, helper text. UI stays dense; measure is column-constrained by the 380px sidebar, not by a prose measure.
- **Label** (Poppins 600, 0.6875rem, 0.05em, uppercase): switch legends — section headers, card flags (LIVE / NEXT / PREVIEW), emergency legend, form field labels.
- **Scripture Reference** (Poppins 500, 0.8rem, 0.08em, uppercase, paprika-bright): the citation line on slides and results. This is the one place paprika is a *reading* color, and it is always short.
- **Wordmark** (Autography 400, ~1.125rem): the "Wordde" header only. Never applied to controls, body text, or anything projected.

### Named Rules
**The Sermon Voice Rule.** Playfair Display renders scripture and nothing else; Poppins never renders scripture. If text will appear on the projector, it is Playfair Display on snow. Autography renders only the wordmark — never scripture, never functional UI.

## Layout

Desktop-only operator surface: a fixed header (translation, undo, live transport, projection control), a 380px workflow sidebar (Search / Browse / Plan / Recent tabs + Display Settings footer), and a flexible Presenter panel (LIVE / Preview / NEXT slide cards stacked 57/43). A thin footer carries keyboard legends and replay.

Spacing rhythm is Tailwind's 4px base at console density: 4–6px inside lists, 8–12px between related controls, 16–24px inside cards. Panels breathe more than lists. Below 768px the app refuses to render — a phone cannot drive a projector; there is no responsive adaptation, by decision.

## Elevation & Depth

Hybrid: tonal layering does the structural work (the ground→card→popover lightness ladder), while short-offset soft shadows lift interactive instruments and glass (`backdrop-filter` blur) marks the fixed chrome over scrolling content. A zero-offset colored halo is decoration — the one permitted halo is the LIVE slide's `glow-pulse`, where it functions as an on-air lamp, not a shadow.

### Shadow Vocabulary
- **Raised** (`var(--neu-raised)` — 0 1px 2px + 0 2px 6px black + 1px inset white highlight): resting inputs and small panels.
- **Raised Strong** (`var(--neu-raised-strong)` — adds 0 8px 22px): focused inputs, popovers, dialogs.
- **Depressed** (`var(--neu-depressed)` / `--neu-flat-depressed`): inset states — selected result field, pressed feel.
- **On-Air** (`@keyframes glow-pulse` — 1px paprika ring + 18–30px paprika halo over a base black shadow): the LIVE slide only.

### Named Rules
**Declared Once Rule.** A surface declares depth with a border *or* a shadow, never both at full strength. The ghost card — 1px border under a wide soft shadow — is banned.

## Shapes

Rounded console-instrument geometry: controls at `radius-md` (12px), cards and slide panels at `radius-xl` (16–20px), status dots perfectly round. Borders are 1px `--border` at rest and tint toward the owning accent when a state engages (paprika/30 on live, hunter/40 on secure). Selection is communicated by an **inset ring** (`inset 0 0 0 1px` in the accent) — never by a thick colored left edge. Drop zones and empty upload wells use 2px dashed `--border`.

## Components

The console at rest is quiet: flat dark fields, muted legends, no shadows shouting. State gives a control its voice — hover lightens one step, selection rings in the accent, engage fills solid, and the live card alone breathes.

### Buttons
- **Shape:** radius-md (12px), compact heights — 28px (h-7) in bars, 32–36px in dialogs/forms.
- **Primary:** solid paprika fill, near-black label, subtle black drop shadow. Reserved for the service-advancing action (Start/Reconnect Projection, Project Now, form submits). Hover: paprika darkens ~5% lightness.
- **Secondary/Outline:** card fill, 1px border; when the button's *meaning* is hunter-domain (Lock, Load Full Chapter, Add Session Screen) it tints hunter — border hunter/40, label hunter-bright.
- **Ghost:** transparent until hover; muted-foreground label that brightens on hover. The default for dense toolbar actions (undo, navigation arrows).
- **Destructive:** solid destructive fill; deletion confirms and Reconnect only.
- **Focus:** 2px paprika ring with 2px offset (`focus-visible` only).

### Chips
- **Style:** pill-less rounded-md tags — 14% alpha accent field, 35–40% alpha accent border, `-bright` accent label (`.chip-paprika`, `.chip-hunter`, `.chip-yellow`, `.chip-ghost`).
- **State:** the LIVE transport chip (paprika) and status dots follow the signal rules; ghost chips label neutral metadata.

### Cards / Containers
- **Corner Style:** radius-xl (16–20px).
- **Background:** card for primary containers; card at 60% alpha for secondary (NEXT, Preview).
- **Shadow Strategy:** none at rest for secondary cards; the LIVE card carries the on-air halo. Reference Elevation.
- **Border:** 1px — `--border` quiet, accent-tinted when the card is the live or active one.
- **Internal Padding:** p-5 (20px) secondary, p-6 (24px) live.
- **Scrolling cards** dissolve their bottom edge with a card-colored gradient fade rather than slicing a line of text mid-glyph.

### Inputs / Fields
- **Style:** card fill, 1px `--border`, radius 12px; the canonical search field is 48px with a leading ghost icon; inline console inputs are 24–32px.
- **Focus:** border warms to paprika, 2px paprika ring, shadow lifts to Raised Strong.
- **Error:** destructive border; 10px destructive message naming the problem ("Verse not found in this chapter").
- **Disabled:** 50% opacity, cursor disabled.

### Navigation
- **Tabs:** full-width quarters of the sidebar; active tab takes a 2px paprika underline and paprika-bright label; inactive are muted-foreground with one-step hover lift.
- **Status indicators:** 8px round lamps + 11px label (`.animate-spark` blink while connecting/live), colored by state — paprika live, yellow transitional, hunter blanked, muted idle.

### Signature — The LIVE Slide Card
The system's hero. 57% of the presenter stack, card ground, 1px paprika/30 border, breathing paprika ring+halo, LIVE legend in paprika-bright, Playfair Display scripture in snow-soft with the reference line in paprika-bright above it. It is the only element permitted ambient motion, the only place the serif reads large, and the operator's constant "this is what the congregation sees" anchor.

## Do's and Don'ts

### Do:
- **Do** use `-bright` accent variants for any accent text or icon on the black ground below ~16px (paprika-bright, hunter-bright).
- **Do** step surfaces up the lightness ladder (ground 3% → card 7% → popover 8%) instead of adding borders to same-tone panels.
- **Do** keep exactly one breathing element (the LIVE card) and one blink grammar (`.animate-spark`) in the interface.
- **Do** dissolve scrolling card edges with a gradient fade matching the card fill.
- **Do** keep the projection window pure: `#000` ground, snow text, no UI chrome — it faces the congregation, not the operator.

### Don't:
- **Don't** introduce new hues. The system is five colors plus destructive; nothing outside it (the incumbent's old navy-blue drift at hsl(228 …) is the named anti-reference).
- **Don't** set small text in base paprika or base hunter on black — that is what the bright variants exist for.
- **Don't** use yellow for text, fills, or decoration; it is a signal lamp only.
- **Don't** mark selection with a thick colored edge (border-l-4) — use the inset ring.
- **Don't** stack a 1px border under a wide soft shadow (ghost card), and don't add a second halo while the LIVE glow exists.
- **Don't** set scripture in Poppins, UI labels in Playfair Display, or anything functional in Autography.
