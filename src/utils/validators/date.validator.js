export const dateValidator = (dateTime) => {
  const dateTimeRegex =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z)?)?$|^(\d{2})\/(\d{2})\/(\d{4})(?:[T\s](\d{2}):(\d{2}):(\d{2}))?$|^(\d{2})-(\d{2})-(\d{4})(?:[T\s](\d{2}):(\d{2}):(\d{2}))?$/;

  const match = dateTime.match(dateTimeRegex);
  if (!match) return false;

  let year,
    month,
    day,
    hours = 0,
    minutes = 0,
    seconds = 0;
  if (match[1]) {
    // YYYY-MM-DD or with time
    year = parseInt(match[1], 10);
    month = parseInt(match[2], 10);
    day = parseInt(match[3], 10);
    if (match[4]) {
      hours = parseInt(match[4], 10);
      minutes = parseInt(match[5], 10);
      seconds = parseInt(match[6], 10);
    }
  } else if (match[7]) {
    // DD/MM/YYYY or with time
    day = parseInt(match[7], 10);
    month = parseInt(match[8], 10);
    year = parseInt(match[9], 10);
    if (match[10]) {
      hours = parseInt(match[10], 10);
      minutes = parseInt(match[11], 10);
      seconds = parseInt(match[12], 10);
    }
  } else {
    // MM-DD-YYYY or with time
    month = parseInt(match[13], 10);
    day = parseInt(match[14], 10);
    year = parseInt(match[15], 10);
    if (match[16]) {
      hours = parseInt(match[16], 10);
      minutes = parseInt(match[17], 10);
      seconds = parseInt(match[18], 10);
    }
  }

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return false;

  if (hours < 0 || hours > 23) return false;
  if (minutes < 0 || minutes > 59) return false;
  if (seconds < 0 || seconds > 59) return false;

  return true;
};
