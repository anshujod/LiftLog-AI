import { describe, expect, it } from "vitest";
import { spokenToDigits, wordsToNumber } from "./numbers";

describe("wordsToNumber", () => {
  it.each([
    [["sixty"], 60],
    [["eight"], 8],
    [["twelve", "point", "five"], 12.5],
    [["sixty", "two", "point", "five"], 62.5],
    [["a", "hundred"], 100],
    [["one", "hundred", "and", "five"], 105],
    [["two", "thousand", "five", "hundred"], 2500],
    [["sixty", "two", "and", "a", "half"], 62.5],
    [["one", "forty"], 140],
    [["five", "by"], null],
  ])("parses %j as %s", (tokens, expected) => {
    expect(wordsToNumber(tokens as string[])).toBe(expected);
  });

  it("rejects non-numbers", () => {
    expect(wordsToNumber([])).toBeNull();
    expect(wordsToNumber(["hello"])).toBeNull();
    expect(wordsToNumber(["a"])).toBeNull();
    expect(wordsToNumber(["point"])).toBeNull();
    expect(wordsToNumber(["point", "five"])).toBeNull(); // no integer part
    expect(wordsToNumber(["point", "twenty"])).toBeNull();
    expect(wordsToNumber(["bench"])).toBeNull();
  });
});

describe("spokenToDigits", () => {
  it("replaces number-word runs with digits", () => {
    expect(spokenToDigits("bench sixty two point five kilos")).toBe("bench 62.5 kilos");
    expect(spokenToDigits("squat a hundred kilos 5 reps")).toBe("squat 100 kilos 5 reps");
    expect(spokenToDigits("deadlift one forty for five")).toBe("deadlift 140 for 5");
  });

  it("leaves non-number text untouched", () => {
    expect(spokenToDigits("log bench press")).toBe("log bench press");
    expect(spokenToDigits("same again")).toBe("same again");
  });
});
