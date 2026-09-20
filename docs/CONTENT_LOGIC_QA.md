# Content Logic QA

Run the browser-level content check after editing HTML and before exporting or delivering PPTX:

```bash
node scripts/html_content_qa.mjs path/to/deck.html --strict
```

The check catches visible text that starts a rendered line with closing punctuation and flags suspicious one- or two-character final lines. It also validates opt-in quantitative chains grouped with `data-content-qa-group` and `data-content-role`.

This is browser-level HTML QA. After PPTX export, render the final deck again because PowerPoint may wrap native text differently from the browser.

## Required reasoning chain

Every material numeric conclusion should make this chain readable on the slide or in its visible supporting note:

`conclusion -> variables/counts -> units -> formula -> result -> source or clearly labeled assumption -> maturity/sensitivity boundary`

Examples:

- Low altitude: `cities × nodes/city × price/node = total project space`.
- Stratosphere: `regions × platforms/region × price/platform = long-term scenario`.

An arithmetic total without its multipliers is incomplete. A working scenario must be labeled as an assumption or scenario, and a public procurement reference must remain distinct from StratoX revenue or a forecast.

## Opt-in quantitative groups

```html
<span data-content-qa-group="low-alt-1" data-content-role="result">0.6 亿元</span>
<span data-content-qa-group="low-alt-1" data-content-role="formula">20 城 × 3 节点/城 × 100 万元/节点 = 0.6 亿元</span>
<span data-content-qa-group="low-alt-1" data-content-role="basis">工作情景：小规模验证</span>
```

Each group requires `result`, `formula`, and either `basis` or `boundary`. The formula must visibly contain a multiplication and/or equality operator. This structural check does not validate arithmetic; manually review units and multiplication.
