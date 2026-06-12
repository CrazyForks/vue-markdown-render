<script setup lang="ts">
import { useData } from 'vitepress'
import { computed } from 'vue'

interface FaqItem {
  question: string
  answer: string
}

const { frontmatter, lang } = useData()

const faqItems = computed<FaqItem[]>(() => {
  const faq = frontmatter.value.faq
  if (!Array.isArray(faq))
    return []

  return faq
    .map((item) => {
      if (!item || typeof item !== 'object')
        return null

      const question = (item as Record<string, unknown>).question
      const answer = (item as Record<string, unknown>).answer

      if (typeof question !== 'string' || typeof answer !== 'string' || !question || !answer)
        return null

      return { question, answer }
    })
    .filter((item): item is FaqItem => Boolean(item))
})

const title = computed(() => lang.value === 'zh-CN' ? '常见问题' : 'FAQ')
</script>

<template>
  <section
    v-if="faqItems.length"
    class="markstream-faq"
    aria-labelledby="markstream-faq-title"
  >
    <h2 id="markstream-faq-title">
      {{ title }}
    </h2>
    <div
      v-for="item in faqItems"
      :key="item.question"
      class="markstream-faq__item"
    >
      <h3>{{ item.question }}</h3>
      <p>{{ item.answer }}</p>
    </div>
  </section>
</template>

<style scoped>
.markstream-faq {
  margin-top: 48px;
  padding-top: 32px;
  border-top: 1px solid var(--vp-c-divider);
}

.markstream-faq h2 {
  margin: 0 0 24px;
}

.markstream-faq__item + .markstream-faq__item {
  margin-top: 24px;
}

.markstream-faq__item h3 {
  margin: 0 0 8px;
}

.markstream-faq__item p {
  margin: 0;
}
</style>
