// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import App from '../App';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it('boots into the main menu with all systems registered', async () => {
  const el = document.createElement('div'); document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(<App />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 1500)); });
  const text = document.body.textContent ?? '';
  expect(text).toContain('ZERO HOUR');
  expect(text).toContain('QUICK START');
  expect(text).toContain('How to Play');
  expect(text).toContain('Mods (');
  // open settings + mod manager overlays
  const buttons = [...document.querySelectorAll('button')];
  await act(async () => { buttons.find((b) => b.textContent?.includes('Mods ('))!.click(); });
  expect(document.body.textContent).toContain('Import .json');
  await act(async () => { [...document.querySelectorAll('button')].find((b) => b.textContent === '✕')!.click(); });
  await act(async () => { [...document.querySelectorAll('button')].find((b) => b.textContent === 'Settings')!.click(); });
  expect(document.body.textContent).toContain('View distance');
}, 30000);
