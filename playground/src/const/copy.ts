export const streamContent = `
---

## 1. Simple inline link

[OpenAI](https://openai.com)

---

## 2. Inline link with a *title* (tooltip)

[OpenAI](https://openai.com "OpenAI – AI research")

---

## 3. **Bold** link  

**[OpenAI](https://openai.com)**

---

## 4. *Italic* link  


*[OpenAI](https://openai.com)*

---

## 5. ***Bold + Italic*** link  


***[OpenAI](https://openai.com)***

---

## 6. Link inside a heading

## Learn more at [OpenAI](https://openai.com)

---

## 7. Link inside a blockquote

> Check out the docs: [OpenAI API](https://platform.openai.com/docs)

---

## 8. Link inside a list

- Official site: [OpenAI](https://openai.com)
- Blog: [OpenAI Blog](https://openai.com/blog)

---

## 9. Numbered list with links

1. First: [OpenAI](https://openai.com)
2. Second: [ChatGPT](https://chat.openai.com)

---

## 10. Link inside a **table**

| Service | URL                         |
|---------|-----------------------------|
| OpenAI  | [openai.com](https://openai.com) |
| ChatGPT | [chat.openai.com](https://chat.openai.com) |

---

## 11. **Bold link inside a table**

| Service | URL                                 |
|---------|-------------------------------------|
| OpenAI  | **[openai.com](https://openai.com)** |
| ChatGPT | **[chat.openai.com](https://chat.openai.com)** |

---

## 12. Link with **escaped parentheses** in the URL  

[Google Maps](https://www.google.com/maps/place/Statue+of+Liberty+(New+York)/)

---

## 13. Autolink (bare URL)

<https://openai.com>

---

## 14. Reference‑style link

Visit the [OpenAI website][openai].

[openai]: https://openai.com "OpenAI – AI research"

---

## 15. Reference‑style link **inside bold**

**See the [OpenAI docs][docs] for details.**

[docs]: https://platform.openai.com/docs

---

## 16. Image that is also a link

[![OpenAI logo](https://openai.com/content/images/2022/05/openai-avatar.png)](https://openai.com)

---

## 17. Link inside **inline code** (displayed as code, not clickable)

\`[OpenAI](https://openai.com)\`

---

## 18. Link inside a **code block** (fenced) – not rendered as a link


\`\`\`
[OpenAI](https://openai.com)
\`\`\`

---

## 19. Link inside **HTML** (raw HTML allowed in many Markdown flavours)

<p>Visit <a href="https://openai.com">OpenAI</a> for more info.

---

## 20. Link with **emoji** and bold


**🚀 [Launch OpenAI](https://openai.com)**

---

## 21. Link inside a **definition list** (GitHub‑flavoured Markdown)


Term  
: Definition with a link to the [OpenAI site](https://openai.com).

---

## 22. Link with **multiple titles** (only the first title is used)


[OpenAI](https://openai.com "First title" "Second title")

---

## 23. Link inside a **nested list**

- Main item
  1. Sub‑item with a link: [OpenAI](https://openai.com)
  2. Another sub‑item

---

## 24. Link with **non‑ASCII characters**

[Åbent bibliotek](https://example.com/åbent)

---

## 25. Link inside a **footnote** (CommonMark footnote syntax)

Here is a reference[^1].

[^1]: See the [OpenAI documentation](https://platform.openai.com/docs).

---

## 26. Link with **HTML entity** in the link text

[OpenAI &amp; ChatGPT](https://openai.com)

---

## 27. Link with **line break** inside the link text (using \`<br>\`)

[OpenAI<br>Platform](https://platform.openai.com)

---

## 28. **Bold image link** (image wrapped in bold and also a link)


**[![OpenAI logo](https://openai.com/content/images/2022/05/openai-avatar.png)](https://openai.com)**

---

## 29. Link inside a **table header**

| **Service** | **URL** |
|-------------|----------|
| OpenAI      | [openai.com](https://openai.com) |

---

## 30. Link with **markdown‑escaped brackets** in the link text

\[[OpenAI]\](https://openai.com)

---

### Quick reference table

| # | Description                              | Markdown example (raw) |
|---|------------------------------------------|------------------------|
| 1 | Inline link                              | \`[OpenAI](https://openai.com)\` |
| 2 | Inline link with title                   | \`[OpenAI](https://openai.com "title")\` |
| 3 | Bold link                                | \`**[OpenAI](https://openai.com)**\` |
| 4 | Italic link                              | \`*[OpenAI](https://openai.com)*\` |
| 5 | Bold + Italic link                       | \`***[OpenAI](https://openai.com)***\` |
| 6 | Link in heading                          | \`## Learn at [OpenAI](https://openai.com)\` |
| 7 | Link in blockquote                       | \`> See [OpenAI](https://openai.com)\` |
| 8 | Link in list                             | \`- [OpenAI](https://openai.com)\` |
| 9 | Numbered list link                       | \`1. [OpenAI](https://openai.com)\` |
|10 | Link in table cell                       | \`| OpenAI | [openai.com](https://openai.com) |\` |
|11 | Bold link in table                       | \`| OpenAI | **[openai.com](https://openai.com)** |\` |
|12 | Escaped parentheses in URL               | \`[Map](https://example.com/(test))\` |
|13 | Autolink                                 | \`<https://openai.com>\` |
|14 | Reference‑style link                     | \`[OpenAI][oa]\n\n[oa]: https://openai.com\` |
|15 | Image that is a link                     | \`[![logo](url)](https://openai.com)\` |
|16 | Link inside code (no click)              | \`\` \` [OpenAI](https://openai.com) \` \`\` |
|17 | HTML anchor                              | \`<a href="https://openai.com">OpenAI</a>\` |
|18 | Emoji + bold link                        | \`**🚀 [Launch](https://openai.com)**\` |
|19 | Definition list link                     | \`Term\n: Definition with [link](https://openai.com)\` |
|20 | Footnote link                            | \`Here[^1]\n\n[^1]: [OpenAI](https://openai.com)\` |

Feel free to copy‑paste any of these snippets into your own Markdown files to see how they render!
`
