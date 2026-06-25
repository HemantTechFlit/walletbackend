const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");

const ensureDefaultAdminSeeded = async () => {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.warn(
      "⚠️  ADMIN_USERNAME or ADMIN_PASSWORD not set — default admin was not created",
    );
    return;
  }

  const existingAdmin = await Admin.findOne({
    username: username.toLowerCase(),
    isDeleted: false,
  }).select("_id");

  if (existingAdmin) {
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await Admin.create({
    username: username.toLowerCase(),
    passwordHash,
    name: "Admin",
    status: "ACTIVE",
  });

  console.log(`✅ Default admin created (username: ${username.toLowerCase()})`);
};

module.exports = {
  ensureDefaultAdminSeeded,
};
