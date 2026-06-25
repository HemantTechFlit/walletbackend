const Wallet = require("../models/Wallet");
const TransactionCategory = require("../models/TransactionCategory");

const DEFAULT_ONBOARDING_WALLETS = [
  {
    slug: "uber",
    walletName: "Uber Wallet",
    description: "",
    icon: "CustomIcons.uber",
    color: "0xff000000",
    currency: "USD",
    sortOrder: 1,
    aliases: ["Uber Wallet"],
  },
  {
    slug: "rydo",
    walletName: "Rydo Wallet",
    description: "",
    icon: "CustomIcons.rydo",
    color: "0xffff9518",
    currency: "USD",
    sortOrder: 2,
    aliases: ["Rydo Wallet"],
  },
  {
    slug: "ubereats",
    walletName: "Uber Eats Wallet",
    description: "",
    icon: "CustomIcons.ubereats",
    color: "0xff06c167",
    currency: "USD",
    sortOrder: 3,
    aliases: ["Uber Eats Wallet"],
  },
  {
    slug: "doordash",
    walletName: "DoorDash Wallet",
    description: "",
    icon: "CustomIcons.doordash",
    color: "0xfff72e08",
    currency: "USD",
    sortOrder: 4,
    aliases: ["DoorDash Wallet", "Door Dash Wallet"],
  },
];

const DEFAULT_ONBOARDING_CATEGORIES = [
  {
    slug: "fuel",
    name: "Fuel",
    description: "",
    icon: "CustomIcons.catFuel",
    color: "0xff4549ff",
    sortOrder: 1,
    type: "EXPENSE",
    aliases: ["Fuel"],
  },
  {
    slug: "service",
    name: "Service",
    description: "",
    icon: "CustomIcons.catService",
    color: "0xfff77b00",
    sortOrder: 2,
    type: "EXPENSE",
    aliases: ["Service"],
  },
  {
    slug: "maintenance",
    name: "Maintenance",
    description: "",
    icon: "CustomIcons.catMaintenance",
    color: "0xfff72e08",
    sortOrder: 3,
    type: "EXPENSE",
    aliases: ["Maintenance"],
  },
  {
    slug: "repair",
    name: "Repair",
    description: "",
    icon: "CustomIcons.catRepair",
    color: "0xff48FFC3",
    sortOrder: 4,
    type: "EXPENSE",
    aliases: ["Repair"],
  },
  {
    slug: "salary",
    name: "Salary (Cash out)",
    description: "",
    icon: "CustomIcons.catPayout",
    color: "0xff5cb109",
    sortOrder: 5,
    type: "EXPENSE",
    aliases: ["Salary (Cash out)", "Salary"],
  },
  {
    slug: "loan",
    name: "Loan",
    description: "",
    icon: "CustomIcons.catLoan",
    color: "0xffFFA800",
    sortOrder: 6,
    type: "EXPENSE",
    aliases: ["Loan"],
  },
  {
    slug: "borrowed",
    name: "Borrowed",
    description: "",
    icon: "CustomIcons.catBorrow",
    color: "0xff0095FF",
    sortOrder: 7,
    type: "INCOME",
    aliases: ["Borrowed"],
  },
];

const stripAliases = ({ aliases, ...item }) => item;

const ensureOnboardingTemplatesSeeded = async () => {
  const [walletCount, categoryCount] = await Promise.all([
    Wallet.countDocuments({ isDefault: true, userId: null, isDeleted: false }),
    TransactionCategory.countDocuments({
      isDefault: true,
      userId: null,
      isDeleted: false,
    }),
  ]);

  if (walletCount > 0 && categoryCount > 0) {
    return;
  }

  if (walletCount === 0) {
    await Promise.all(
      DEFAULT_ONBOARDING_WALLETS.map((wallet) =>
        Wallet.create({
          ...stripAliases(wallet),
          userId: null,
          isDefault: true,
        }),
      ),
    );
  }

  if (categoryCount === 0) {
    await Promise.all(
      DEFAULT_ONBOARDING_CATEGORIES.map((category) =>
        TransactionCategory.create({
          ...stripAliases(category),
          userId: null,
          isDefault: true,
        }),
      ),
    );
  }

  console.log("✅ Onboarding templates seeded");
};

module.exports = {
  DEFAULT_ONBOARDING_WALLETS,
  DEFAULT_ONBOARDING_CATEGORIES,
  ensureOnboardingTemplatesSeeded,
};
