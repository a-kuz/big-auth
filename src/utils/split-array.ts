export const splitArray = <T>(arr: T[], size: number): T[][] =>
  arr.reduce<T[][]>(
    (p, c: T) => {
      if (p[p.length - 1].length == size) {
        p.push([])
      }

      p[p.length - 1].push(c)
      return p
    },
    [[]],
  )
