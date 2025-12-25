export const streamContent = `
> **给定输入 $ x $ 和上下文 $ \gamma $，模型要根据已生成的部分输出 $ y_{<i} $，逐 token 地预测下一个 token $ y_i $，并最大化所有 token 的联合概率。**

这个 markdown，显示出来的公式有问题，而且当我使用
https://markstream-vue.simonhe.me/test
去测试的时候，点击流式渲染会页面崩溃
`
