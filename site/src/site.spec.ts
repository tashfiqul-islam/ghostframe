import { describe, expect, test } from 'bun:test'
import { siteOrigin } from './site'

describe('siteOrigin', () => {
  test('fails the build while the origin is unset', () => {
    expect(() => siteOrigin('')).toThrow("set the site's origin in site/src/site.ts")
  })

  test('accepts only an https origin', () => {
    expect(() => siteOrigin('http://ghostframe.example')).toThrow('the site origin must be https://, not "http://ghostframe.example"')
  })

  test('drops a trailing slash, so paths join with one', () => {
    expect(siteOrigin('https://ghostframe.example/')).toBe('https://ghostframe.example')
  })

  test('refuses a path, which canonical URLs would repeat', () => {
    expect(() => siteOrigin('https://example.dev/site')).toThrow('the site origin is scheme and host only, not "https://example.dev/site"')
  })
})
