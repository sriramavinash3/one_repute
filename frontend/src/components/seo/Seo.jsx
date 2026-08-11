import { useEffect } from 'react'
import { SITE_NAME, SITE_URL, SITE_IMAGE, DEFAULT_TITLE, DEFAULT_DESCRIPTION } from './config'

const SEO_MANAGED = 'data-seo-managed'
const DEFAULT_DOCUMENT_TITLE = typeof document !== 'undefined' ? document.title : DEFAULT_TITLE

function buildUrl(path) {
  return `${SITE_URL}${path === '/' ? '/' : path.startsWith('/') ? path : `/${path}`}`
}

function upsertMeta(attr, key, content) {
  if (!content) return
  const selector = `meta[${attr}="${key}"]`
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    el.setAttribute(SEO_MANAGED, '')
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel, href) {
  if (!href) return
  const selector = `link[rel="${rel}"]`
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    el.setAttribute(SEO_MANAGED, '')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

function setJsonLd(jsonLd) {
  if (!jsonLd) return
  let script = document.getElementById('page-jsonld')
  if (!script) {
    script = document.createElement('script')
    script.id = 'page-jsonld'
    script.type = 'application/ld+json'
    script.setAttribute(SEO_MANAGED, '')
    document.head.appendChild(script)
  }
  const payload = Array.isArray(jsonLd) ? jsonLd : [jsonLd]
  script.textContent = payload.map((item) => JSON.stringify(item)).join('\n')
}

export default function Seo({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  path = '/',
  image = SITE_IMAGE,
  type = 'website',
  noindex = false,
  jsonLd = null
}) {
  const url = buildUrl(path)

  useEffect(() => {
    document.title = title
    upsertMeta('name', 'description', description)
    upsertMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow')
    upsertLink('canonical', url)

    upsertMeta('property', 'og:type', type)
    upsertMeta('property', 'og:url', url)
    upsertMeta('property', 'og:title', title)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:image', image)
    upsertMeta('property', 'og:site_name', SITE_NAME)
    upsertMeta('property', 'og:locale', 'en_IN')

    upsertMeta('name', 'twitter:card', noindex ? 'summary' : 'summary_large_image')
    upsertMeta('name', 'twitter:title', title)
    upsertMeta('name', 'twitter:description', description)
    upsertMeta('name', 'twitter:image', image)

    setJsonLd(jsonLd)

    return () => {
      document.head.querySelectorAll(`[${SEO_MANAGED}]`).forEach((el) => el.remove())
      document.title = DEFAULT_DOCUMENT_TITLE
    }
  }, [title, description, path, image, type, noindex, jsonLd, url])

  return null
}
