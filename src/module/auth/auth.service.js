import crypto from 'crypto';
import jwt from 'jsonwebtoken';

import {
  findOneUser,
  insertUser,
  updateOneUser,
} from '../../model/controller/user.controller.js';
import { validateIRPhoneSyntax } from '../../utils/validators/phone.validator.js';

// import { sendSms } from '../../utils/sendSms.js';

// Generate OTP
const generateOTP = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

// Hash OTP
const hashOTP = (code) => {
  return crypto
    .createHmac('sha256', process.env.OTP_SECRET)
    .update(code)
    .digest('hex');
};

// Compare OTP
const compareOTP = (code, hashedCode) => {
  const inputHash = Buffer.from(hashOTP(code), 'hex');
  const storedHash = Buffer.from(hashedCode, 'hex');

  return (
    inputHash.length === storedHash.length &&
    crypto.timingSafeEqual(inputHash, storedHash)
  );
};

// Send Login Code
export const sendLoginCodeService = async (data) => {
  let { phone } = data;

  if (phone.startsWith('0')) phone = `+98${phone.slice(1)}`;

  if (!phone || !validateIRPhoneSyntax(phone))
    throw new Error('Invalid phone number', { cause: { code: 400 } });

  if (!['DEV', 'PROD'].includes(process.env.STATUS))
    throw new Error('Invalid application status', { cause: { code: 500 } });

  // Find user
  let user = await findOneUser({ phone });
  // Create user if not exists
  if (!user) {
    user = await insertUser({ phone, username: `user_${crypto.randomBytes(5).toString('hex')}`, role: "user" });
  }

  // Generate OTP
  const code = generateOTP();
  console.log(code)
  const codeHash = hashOTP(code);

  const sentAt = new Date();
  const expiresAt = new Date(sentAt.getTime() + 5 * 60 * 1000);

  console.log(user)

  // Save authentication data
  await updateOneUser(
    { _id: user._id },
    {
      'auth.code_hash': codeHash,
      'auth.login.sent_at': sentAt,
      'auth.login.expires_at': expiresAt,
      'auth.login.attempts': 0,
    },
  );


  if (process.env.STATUS == "DEV") {
    console.log(code)
    return code
  }

  // // Send SMS
  // try {
  //   await sendSms(phone, code);
  // } catch (error) {
  //   await updateOneUser(
  //     { _id: user._id },
  //     {
  //       'auth.code_hash': null,
  //       'auth.login.sent_at': null,
  //       'auth.login.expires_at': null,
  //     },
  //   );
  // throw error;
  // }

  return true
};

// Verify Login Code
export const verifyLoginCodeService = async (data) => {
  let { phone, code } = data;

  if (phone.startsWith('0')) phone = `+98${phone.slice(1)}`;

  if (!phone || !validateIRPhoneSyntax(phone))
    throw new Error('Invalid phone number', { cause: { code: 400 } });

  // Find user
  const user = await findOneUser({ phone });

  if (!user)
    throw new Error('User not found', { cause: { code: 404 } });

  const auth = user.auth;

  if (!auth?.code_hash || !auth?.login?.expires_at)
    throw new Error('Verification code not found', { cause: { code: 404 } });

  // Check expiration
  if (Date.now() >= new Date(auth.login.expires_at).getTime()) {
    await updateOneUser(
      { _id: user._id },
      {
        'auth.code_hash': null,
        'auth.login.sent_at': null,
        'auth.login.expires_at': null,
        'auth.login.attempts': 0,
      },
    );

    throw new Error('Verification code expired', { cause: { code: 400 } });
  }

  // Check attempts
  if (auth.login.attempts >= 5)
    throw new Error('Too many incorrect attempts', { cause: { code: 429 } });

  // Compare code
  if (!compareOTP(String(code), auth.code_hash)) {
    await updateOneUser(
      {
        _id: user._id,
        'auth.login.attempts': { $lt: 5 },
      },
      {
        'auth.login.attempts': auth.login.attempts + 1,
      },
    );

    throw new Error('Invalid verification code', { cause: { code: 400 } });
  }

  // Remove OTP after successful verification
  await updateOneUser(
    { _id: user._id },
    {
      'auth.code_hash': null,
      'auth.login.sent_at': null,
      'auth.login.expires_at': null,
      'auth.login.attempts': 0,
    },
  );

  // Generate JWT
  const token = jwt.sign(
    { _id: user._id, role: user.role, phone: user.phone, username: user.username, is_seller: user.is_seller ? true : false },
    process.env.JWT_SECRET,
    { expiresIn: '30d' },
  );

  // Remove sensitive authentication data
  const userData = user;
  delete userData.password;
  delete userData.auth;

  return {
    token,
    user: userData,
  };
};