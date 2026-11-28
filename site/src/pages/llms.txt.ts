import type { APIRoute } from 'astro'
import { llmsTxt } from '../../build/llms/llms'
import { siteData } from '../../build/site-data/site-data'
import { words } from '../content/words'
import { origin } from '../site'

export const GET: APIRoute = () =>
  new Response(llmsTxt(siteData(), { origin, summary: words.landing.description }), { headers: { 'content-type': 'text/plain; charset=utf-8' } })
