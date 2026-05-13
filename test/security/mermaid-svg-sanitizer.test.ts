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

  it('removes foreignObject active HTML content in strict sanitizer', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10">
        <foreignObject>
          <iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>
        </foreignObject>
        <rect width="10" height="10" />
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).not.toMatch(/foreignObject/i)
    expect(svg).not.toMatch(/iframe/i)
    expect(svg).not.toMatch(/srcdoc/i)
    expect(svg).not.toMatch(/script/i)
  })

  it('removes non-SVG tags from Mermaid output', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10">
        <video src="https://example.com/a.mp4"></video>
        <rect width="10" height="10" />
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).not.toMatch(/video/i)
    expect(svg).toMatch(/<rect/i)
  })

  it('removes dangerous style tag content', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10">
        <style>@import url(javascript:alert(1));</style>
        <rect width="10" height="10" />
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).not.toContain('<style')
    expect(svg).not.toMatch(/@import/i)
    expect(svg).not.toMatch(/javascript:/i)
  })

  it('removes dangerous style URLs', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10">
        <style>.x { background: url(javascript:alert(1)); }</style>
        <rect width="10" height="10" style="background:url(javascript:alert(1))" />
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).not.toContain('<style')
    expect(svg).not.toMatch(/\sstyle=/i)
    expect(svg).not.toMatch(/javascript:/i)
  })

  it('removes unsafe SVG href attributes', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10" xmlns:xlink="http://www.w3.org/1999/xlink">
        <use xlink:href="javascript:alert(1)" />
        <image href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" />
        <rect width="10" height="10" />
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).not.toMatch(/xlink:href=/i)
    expect(svg).not.toMatch(/data:text\/html/i)
  })

  it('detects broken Mermaid SVG output', () => {
    expect(isBrokenMermaidSvg('<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>')).toBe(false)
    expect(isBrokenMermaidSvg('<svg viewBox="0 0 0 10"><rect width="10" height="10" /></svg>')).toBe(true)
    expect(isBrokenMermaidSvg('<svg viewBox="0 0 10 10"><rect width="NaN" height="10" /></svg>')).toBe(true)
    expect(isBrokenMermaidSvg('<div></div>')).toBe(true)
  })
})
