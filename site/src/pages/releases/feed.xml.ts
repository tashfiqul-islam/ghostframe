import type { APIRoute } from 'astro'
import { atomFeed } from '../../../build/release-notes/releases'
import { siteData } from '../../../build/site-data/site-data'
import { origin } from '../../site'

export const GET: APIRoute = () => new Response(atomFeed(siteData().releases, origin), { headers: { 'content-type': 'application/atom+xml; charset=utf-8' } })
