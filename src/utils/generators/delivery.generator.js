import dotenv from 'dotenv';

dotenv.config();

let holidays = process.env.HOLIDAYS || '2025-03-21,2025-03-22,2025-02-11,2025-07-27,2025-07-28';

holidays = holidays.split(',').map((date) => new Date(date).toDateString());

export function calculateEstimatedDelivery(isExpress = false) {
  const processingDays = Number(process.env.PROCESSING_DAYS) || 2;
  const shippingDays = Number(process.env.SHIPPING_DAYS) || 7;
  const shippingExpressDays = Number(process.env.SHIPPING_EXPRESS_DAYS) || 3;

  let estimatedDate = new Date();

  estimatedDate.setDate(estimatedDate.getDate() + processingDays);

  estimatedDate.setDate(estimatedDate.getDate() + (isExpress ? shippingExpressDays : shippingDays));

  while (holidays.includes(estimatedDate.toDateString()) || estimatedDate.getDay() === 5) {
    estimatedDate.setDate(estimatedDate.getDate() + 1);
  }

  return estimatedDate;
}
