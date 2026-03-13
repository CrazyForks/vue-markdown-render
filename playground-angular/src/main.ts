import 'katex/dist/katex.min.css'
import './app.css'
import './test-lab.css'

function resolveVendorAssetUrl(pathname: string) {
  if (typeof document !== 'undefined')
    return new URL(pathname.replace(/^\/+/, ''), document.baseURI).href

  return pathname
}

async function bootstrap() {
  // Angular's JIT fallback must be registered before partially compiled
  // libraries are evaluated. Loading it in Promise.all can race on /test.
  await import('@angular/compiler')

  const [
    { enableD2 },
    { provideZonelessChangeDetection },
    { bootstrapApplication },
    { AppComponent },
  ] = await Promise.all([
    import('markstream-angular'),
    import('@angular/core'),
    import('@angular/platform-browser'),
    import('./app.component'),
  ])

  const d2VendorUrl = resolveVendorAssetUrl('/vendor/d2-browser.js')
  enableD2?.(() => import(/* @vite-ignore */ d2VendorUrl))

  return bootstrapApplication(AppComponent, {
    providers: [
      provideZonelessChangeDetection(),
    ],
  })
}

bootstrap().catch((error) => {
  console.error('[playground-angular] bootstrap failed', error)
})
