// @flow
import invariant from '../src';

it('should not throw if condition is truthy', () => {
  const truthy: mixed[] = [1, -1, true, {}, [], Symbol(), 'hi'];
  truthy.forEach((value: mixed) =>
    expect(() => invariant(value)).not.toThrow(),
  );
});

it('should throw if the condition is falsy', () => {
  // https://github.com/getify/You-Dont-Know-JS/blob/master/types%20%26%20grammar/ch4.md#falsy-values
  const falsy: mixed[] = [undefined, null, false, +0, -0, NaN, ''];
  falsy.forEach((value: mixed) => expect(() => invariant(value)).toThrow());
});
