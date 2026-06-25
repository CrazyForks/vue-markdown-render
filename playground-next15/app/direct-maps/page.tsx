import { DirectMapsClient } from '../../src/direct-maps-client'

const content = [
  '<DocumentLink id="app-router">Streaming Map</DocumentLink>',
  '',
  '<badge tone="warm">HTML Map</badge>',
].join('\n')

export default function DirectMapsPage() {
  return (
    <main data-next-direct-map="page">
      <DirectMapsClient content={content} />
    </main>
  )
}
