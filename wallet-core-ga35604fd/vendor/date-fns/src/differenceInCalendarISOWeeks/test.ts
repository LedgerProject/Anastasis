/* eslint-env mocha */

import assert from 'power-assert'
import differenceInCalendarISOWeeks from '.'

describe('differenceInCalendarISOWeeks', function () {
  it('returns the number of calendar ISO weeks between the given dates', function () {
    const result = differenceInCalendarISOWeeks(
      new Date(2014, 6 /* Jul */, 8, 18, 0),
      new Date(2014, 5 /* Jun */, 29, 6, 0)
    )
    assert(result === 2)
  })

  it('returns a negative number if the time value of the first date is smaller', function () {
    const result = differenceInCalendarISOWeeks(
      new Date(2014, 5 /* Jun */, 29, 6, 0),
      new Date(2014, 6 /* Jul */, 8, 18, 0)
    )
    assert(result === -2)
  })

  it('accepts timestamps', function () {
    const result = differenceInCalendarISOWeeks(
      new Date(2014, 6 /* Jul */, 12).getTime(),
      new Date(2014, 6 /* Jul */, 2).getTime()
    )
    assert(result === 1)
  })

  describe('edge cases', function () {
    it('the difference is less than an ISO week, but the given dates are in different calendar ISO weeks', function () {
      const result = differenceInCalendarISOWeeks(
        new Date(2014, 6 /* Jul */, 7),
        new Date(2014, 6 /* Jul */, 6)
      )
      assert(result === 1)
    })

    it('the same for the swapped dates', function () {
      const result = differenceInCalendarISOWeeks(
        new Date(2014, 6 /* Jul */, 6),
        new Date(2014, 6 /* Jul */, 7)
      )
      assert(result === -1)
    })

    it('the days of weeks of the given dates are the same', function () {
      const result = differenceInCalendarISOWeeks(
        new Date(2014, 6 /* Jul */, 9),
        new Date(2014, 6 /* Jul */, 2)
      )
      assert(result === 1)
    })

    it('the given dates are the same', function () {
      const result = differenceInCalendarISOWeeks(
        new Date(2014, 8 /* Sep */, 5, 0, 0),
        new Date(2014, 8 /* Sep */, 5, 0, 0)
      )
      assert(result === 0)
    })

    it('does not return -0 when the given dates are the same', () => {
      function isNegativeZero(x: number): boolean {
        return x === 0 && 1 / x < 0
      }

      const result = differenceInCalendarISOWeeks(
        new Date(2014, 8 /* Sep */, 5, 0, 0),
        new Date(2014, 8 /* Sep */, 5, 0, 0)
      )

      const resultIsNegative = isNegativeZero(result)
      assert(resultIsNegative === false)
    })
  })

  it('returns NaN if the first date is `Invalid Date`', function () {
    const result = differenceInCalendarISOWeeks(
      new Date(NaN),
      new Date(2017, 0 /* Jan */, 1)
    )
    assert(isNaN(result))
  })

  it('returns NaN if the second date is `Invalid Date`', function () {
    const result = differenceInCalendarISOWeeks(
      new Date(2017, 0 /* Jan */, 1),
      new Date(NaN)
    )
    assert(isNaN(result))
  })

  it('returns NaN if the both dates are `Invalid Date`', function () {
    const result = differenceInCalendarISOWeeks(new Date(NaN), new Date(NaN))
    assert(isNaN(result))
  })

  it('throws TypeError exception if passed less than 2 arguments', function () {
    assert.throws(differenceInCalendarISOWeeks.bind(null), TypeError)
    assert.throws(differenceInCalendarISOWeeks.bind(null, 1), TypeError)
  })
})
