import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist')

const SITE_URL = 'https://onerepute.com'
const LOGO_URL = `${SITE_URL}/logo.png`
const OG_IMAGE = `${SITE_URL}/og-image.png`

const organizationLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'One Repute',
  url: SITE_URL,
  logo: LOGO_URL,
  email: 'support@onerepute.com',
  description:
    'One Repute provides an exclusive infrastructure for automated reputation management. Authorized outlets get human-like AI replies and instant manager escalations via WhatsApp.'
}

const softwareAppLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'One Repute',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: `${SITE_URL}/`,
  description:
    'Enterprise reputation management system that automates Google review responses with AI and escalates critical reviews to managers via WhatsApp.',
  publisher: {
    '@type': 'Organization',
    name: 'One Repute',
    url: SITE_URL,
    logo: LOGO_URL
  }
}

const webSiteLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'One Repute',
  url: `${SITE_URL}/`,
  publisher: {
    '@type': 'Organization',
    name: 'One Repute',
    url: SITE_URL,
    logo: LOGO_URL
  }
}

function webPageLd(path) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: path === '/' ? 'One Repute — AI-Powered Google Review Management' : `${path.replace('/', '')} | One Repute`,
    url: `${SITE_URL}${path === '/' ? '/' : path}`,
    description: 'One Repute — AI-powered Google review management.',
    isPartOf: { '@type': 'WebSite', name: 'One Repute', url: `${SITE_URL}/` }
  }
}

const routes = [
  {
    path: '/',
    outFile: 'index.html',
    title: 'One Repute — AI-Powered Google Review Management',
    description:
      'Automate Google review replies with human-like AI, get instant WhatsApp escalation alerts for negative reviews, and manage multi-outlet reputation from one secure dashboard.',
    robots: 'index, follow',
    type: 'website',
    card: 'summary_large_image',
    jsonLd: [organizationLd, softwareAppLd, webSiteLd, webPageLd('/')]
  },
  {
    path: '/login',
    outFile: 'login/index.html',
    title: 'Login | One Repute',
    description:
      'Sign in to your One Repute dashboard to manage Google review automation, AI replies, and WhatsApp escalation alerts.',
    robots: 'noindex, nofollow',
    type: 'website',
    card: 'summary',
    jsonLd: [webSiteLd, webPageLd('/login')]
  },
  {
    path: '/onboarding',
    outFile: 'onboarding/index.html',
    title: 'Create Account | One Repute',
    description:
      'Set up your One Repute workspace and start your free trial for AI-powered Google review management.',
    robots: 'noindex, nofollow',
    type: 'website',
    card: 'summary',
    jsonLd: [webSiteLd, webPageLd('/onboarding')]
  },
  {
    path: '/reset-password',
    outFile: 'reset-password/index.html',
    title: 'Reset Password | One Repute',
    description: 'Reset your One Repute account password securely.',
    robots: 'noindex, nofollow',
    type: 'website',
    card: 'summary',
    jsonLd: [webSiteLd, webPageLd('/reset-password')]
  },
  {
    path: '/verify-email',
    outFile: 'verify-email/index.html',
    title: 'Verify Email | One Repute',
    description: 'Verify your email address to activate your One Repute account.',
    robots: 'noindex, nofollow',
    type: 'website',
    card: 'summary',
    jsonLd: [webSiteLd, webPageLd('/verify-email')]
  }
]

const html = readFileSync(join(distDir, 'index.html'), 'utf8')

const assetTags = html.match(/<(?:script|link)[^>]+(?:src|href)="\/assets\/[^"]+"[^>]*>/g) || []
const jsTags = assetTags.filter((t) => t.includes('<script'))
const cssTags = assetTags.filter((t) => t.includes('rel="stylesheet"') || t.includes('rel="modulepreload"'))

function renderHead(route) {
  const url = `${SITE_URL}${route.path === '/' ? '/' : route.path}`
  const jsonLdBlocks = route.jsonLd.map((data) => {
    const pretty = JSON.stringify(data, null, 2).split('\n').map((l) => `      ${l}`).join('\n')
    return `    <script type="application/ld+json">\n${pretty}\n    </script>`
  }).join('\n')

  return `  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#6366f1" />
    <meta name="description" content="${route.description}" />
    <meta name="robots" content="${route.robots}" />

    <title>${route.title}</title>

    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    <link rel="shortcut icon" type="image/x-icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" href="/favicon.ico" />
    <link rel="canonical" href="${url}" />
    <link rel="manifest" href="/manifest.webmanifest" />

    <meta property="og:type" content="${route.type}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${route.title}" />
    <meta property="og:description" content="${route.description}" />
    <meta property="og:image" content="${OG_IMAGE}" />
    <meta property="og:site_name" content="One Repute" />
    <meta property="og:locale" content="en_IN" />

    <meta name="twitter:card" content="${route.card}" />
    <meta name="twitter:title" content="${route.title}" />
    <meta name="twitter:description" content="${route.description}" />
    <meta name="twitter:image" content="${OG_IMAGE}" />

${jsonLdBlocks}
    ${cssTags.join('\n    ')}
    ${jsTags.join('\n    ')}
  </head>`
}

for (const route of routes) {
  const outPath = join(distDir, route.outFile)
  const rendered = `<!doctype html>
<html lang="en">
${renderHead(route)}
  <body>
    <div id="root"></div>

  </body>
</html>
`
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, rendered)
  console.log(`Prerendered ${route.path} -> dist/${route.outFile}`)
}

console.log('Prerender complete.')
