import { css } from "lit";

// Shared tokens + card chrome. Accent reads the live theme var (--gr-accent*),
// falling back to the amber the dashboard already uses.
export const emberTokens = css`
  :host {
    --ember-accent: var(--gr-accent, #e0a03c);
    --ember-accent-strong: var(--gr-accent-strong, #e8b24a);
    --ember-accent-bg: var(--gr-accent-bg, rgba(224, 160, 60, 0.15));
    --ember-good: var(--gr-good, #52b583);
    --ember-teal: var(--gr-teal-strong, #4cb8af);
    --ember-teal-bg: var(--gr-teal-bg, rgba(46, 155, 147, 0.14));
    --ember-warn: var(--gr-warn, #e0a94a);
    --ember-alert: var(--gr-alert, #e5705c);
    --ember-mono: ui-monospace, Menlo, Consolas, monospace;
    --ember-radius: 20px;
    --ember-pad: 20px;
  }
`;

export const emberCard = css`
  ha-card {
    padding: var(--ember-pad);
    border-radius: var(--ember-radius);
    height: 100%;
    box-sizing: border-box;
    border: 1px solid var(--divider-color);
  }
  ha-card.lit {
    border-color: var(--ember-accent);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .head ha-icon {
    --mdc-icon-size: 26px;
    color: var(--disabled-text-color);
  }
  ha-card.lit .head ha-icon {
    color: var(--ember-accent);
  }
  .title {
    font-size: 20px;
    font-weight: 600;
    color: var(--primary-text-color);
  }
`;
