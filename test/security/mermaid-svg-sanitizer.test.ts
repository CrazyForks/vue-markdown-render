/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest'
import { isBrokenMermaidSvg, sanitizeMermaidSvg } from '../../src/components/MermaidBlockNode/mermaidSvgSanitizer'

describe('mermaid SVG sanitizer', () => {
  it('removes executable SVG markup', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10" onload="alert(1)">
        <script>alert(1)</script>
        <a href="javascript:alert(1)">
          <text style="background:url(javascript:alert(1))">x</text>
        </a>
        <image href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" />
        <rect width="10" height="10" />
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).not.toMatch(/<script/i)
    expect(svg).not.toMatch(/\son[a-z]+\s*=/i)
    expect(svg).not.toMatch(/javascript:/i)
    expect(svg).not.toMatch(/vbscript:/i)
    expect(svg).not.toMatch(/data:text\/html/i)
    expect(svg).not.toMatch(/expression\s*\(/i)
    expect(svg).not.toMatch(/@import/i)
  })

  it('detects broken Mermaid SVG output', () => {
    expect(isBrokenMermaidSvg('<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>')).toBe(false)
    expect(isBrokenMermaidSvg('<svg viewBox="0 0 0 10"><rect width="10" height="10" /></svg>')).toBe(true)
    expect(isBrokenMermaidSvg('<svg viewBox="0 0 10 10"><rect width="NaN" height="10" /></svg>')).toBe(true)
    expect(isBrokenMermaidSvg('<div></div>')).toBe(true)
  })
})
