const PlannedPayment = require("../models/PlannedPayment");

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const padDatePart = (value) => String(value).padStart(2, "0");

const occurrenceKey = (date) => {
  const d = startOfDay(date);
  return [
    d.getFullYear(),
    padDatePart(d.getMonth() + 1),
    padDatePart(d.getDate()),
  ].join("-");
};

const addRepeatInterval = (date, interval, unit) => {
  const next = new Date(date);

  if (unit === "DAYS") {
    next.setDate(next.getDate() + interval);
  } else if (unit === "WEEKS") {
    next.setDate(next.getDate() + interval * 7);
  } else if (unit === "MONTHS") {
    next.setMonth(next.getMonth() + interval);
  } else if (unit === "YEARS") {
    next.setFullYear(next.getFullYear() + interval);
  }

  return next;
};

const generateOccurrences = (plannedPayment, today, rangeEnd, includeOverdue) => {
  const decisions = new Map();
  (plannedPayment.decisions || []).forEach((decision) => {
    decisions.set(decision.occurrenceKey, decision);

    if (decision.occurrenceDate) {
      decisions.set(occurrenceKey(decision.occurrenceDate), decision);
    }
  });

  const totalOccurrences =
    plannedPayment.plannedType === "ONE_TIME"
      ? 1
      : plannedPayment.repeatUntilTimes;

  const occurrences = [];
  let current = startOfDay(plannedPayment.startDate);

  for (let index = 1; index <= totalOccurrences; index += 1) {
    const key = occurrenceKey(current);
    const decision = decisions.get(key);

    if (!decision) {
      const occurrenceDate = startOfDay(current);
      const isOverdue = occurrenceDate < today;
      const isUpcoming = occurrenceDate > today && occurrenceDate <= rangeEnd;

      if ((includeOverdue && isOverdue) || isUpcoming) {
        occurrences.push({
          plannedPayment,
          occurrence: {
            occurrenceKey: key,
            occurrenceNumber: index,
            occurrenceDate,
            status: isOverdue ? "OVERDUE" : "UPCOMING",
          },
        });
      }
    }

    if (plannedPayment.plannedType === "ONE_TIME") {
      break;
    }

    current = addRepeatInterval(
      current,
      plannedPayment.repeatInterval,
      plannedPayment.repeatUnit,
    );
  }

  return occurrences;
};

const formatOccurrence = ({ plannedPayment, occurrence }) => ({
  _id: `${plannedPayment._id}:${occurrence.occurrenceKey}`,
  plannedPaymentId: plannedPayment._id,
  occurrenceKey: occurrence.occurrenceKey,
  occurrenceNumber: occurrence.occurrenceNumber,
  occurrenceDate: occurrence.occurrenceDate,
  status: occurrence.status,
  type: plannedPayment.type,
  title: plannedPayment.title,
  amount: plannedPayment.amount,
  description: plannedPayment.description,
  plannedType: plannedPayment.plannedType,
  startDate: plannedPayment.startDate,
  repeatInterval: plannedPayment.repeatInterval,
  repeatUnit: plannedPayment.repeatUnit,
  repeatUntilTimes: plannedPayment.repeatUntilTimes,
  walletId: plannedPayment.walletId,
  categoryId: plannedPayment.categoryId,
});

const fetchPlannedPaymentOccurrences = async (userId, { days, occurrenceType = "UPCOMING" }) => {
  const today = startOfDay(new Date());
  const rangeEnd = endOfDay(today);
  rangeEnd.setDate(rangeEnd.getDate() + days);

  const plannedPayments = await PlannedPayment.find({
    userId,
    status: "ACTIVE",
    isDeleted: false,
    startDate: { $lte: rangeEnd },
  })
    .populate("walletId", "walletName")
    .populate("categoryId", "name")
    .lean();

  const includeOverdue = occurrenceType === "ALL" || occurrenceType === "OVERDUE";

  let items = plannedPayments.flatMap((plannedPayment) =>
    generateOccurrences(plannedPayment, today, rangeEnd, includeOverdue),
  );

  if (occurrenceType !== "ALL") {
    items = items.filter((item) => item.occurrence.status === occurrenceType);
  }

  items.sort(
    (a, b) =>
      a.occurrence.occurrenceDate.getTime() - b.occurrence.occurrenceDate.getTime(),
  );

  return {
    items: items.map(formatOccurrence),
    count: items.length,
  };
};

module.exports = {
  startOfDay,
  endOfDay,
  occurrenceKey,
  addRepeatInterval,
  generateOccurrences,
  formatOccurrence,
  fetchPlannedPaymentOccurrences,
};
