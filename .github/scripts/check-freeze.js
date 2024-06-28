const { exit } = require('process');

function parseFreezePeriods(input) {
  const periods = input.split(',').map(period => {
    const [start, end] = period.split(':');
    return { start, end };
  });
  return periods;
}

const freezePeriods = parseFreezePeriods(process.env.FREEZE_PERIODS);
const currentDate = new Date().toISOString().split('T')[0];

function isWithinFreezePeriod(date) {
  for (const period of freezePeriods) {
    if (date >= period.start && date <= period.end) {
      return true;
    }
  }
  return false;
}

if (isWithinFreezePeriod(currentDate)) {
  console.log(`Code freeze in effect! Current date ${currentDate} is within a freeze period.`);
  exit(1); // Exit with a non-zero code to fail the action
} else {
  console.log(`No code freeze. Current date ${currentDate} is outside of freeze periods.`);
}
