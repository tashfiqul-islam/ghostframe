import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { readSiteData } from '../../build/site-data/site-data'
import { eyeThresholds } from './status-line'

test("the site's eye thresholds are the status line's", () => {
  expect(eyeThresholds).toEqual(readSiteData(resolve(import.meta.dir, '..', '..', '..')).facts.eyeThresholds)
})
