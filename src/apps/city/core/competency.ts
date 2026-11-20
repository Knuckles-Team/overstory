/**
 * @file competency.ts
 * @description The competency questions for the five fun pillars
 * (OVERSTORY-CITY-R045, constitution R-G8). A question is answered by a
 * named test, or it is a named playtest with an owner row.
 */
export interface CompetencyQuestion {
  id: string
  question: string
  kind: 'test' | 'playtest'
  /** The test that answers it (`file::name`), or the owner row of the playtest. */
  answer: string
}

export const COMPETENCY_QUESTIONS: readonly CompetencyQuestion[] = [
  {
    id: 'building-changes-system',
    question: 'Does building visibly change the system?',
    kind: 'test',
    answer: 'src/apps/city/__tests__/competency.test.ts::competency',
  },
  {
    id: 'city-grows-with-work',
    question: 'Does the city grow when the work grows?',
    kind: 'test',
    answer: 'src/apps/city/__tests__/competency.test.ts::competency',
  },
  {
    id: 'places-worth-exploring',
    question: 'Are there places worth exploring?',
    kind: 'playtest',
    answer: 'OVERSTORY-CITY-R019',
  },
  {
    id: 'sounds-right-at-every-zoom',
    question: 'Does the city sound right at every zoom level?',
    kind: 'test',
    answer: 'src/apps/city/__tests__/audio.test.ts::zoom_layers',
  },
  {
    id: 'keeps-users-time-of-day',
    question: "Does the world keep the user's time of day?",
    kind: 'test',
    answer: 'src/apps/city/__tests__/competency.test.ts::competency',
  },
]
