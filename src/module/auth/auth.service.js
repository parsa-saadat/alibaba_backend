import { v4 as uuidv4 } from 'uuid';
import { hash, genSalt, compare } from 'bcrypt';
import jwt from 'jsonwebtoken';
import axios from 'axios';

import {
  findOneUser,
  insertUser,
  updateOneUser,
} from '../../model/controller/user.controller.js';
import { validateIRPhoneSyntax } from '../../utils/validators/phone.validator.js';
import { generateNumber } from '../../utils/generators/number.generator.js';

export const preService = async (data) => {
  let { phone, accept_rules } = data;

  if (!phone && !accept_rules)
    throw new Error('Phone number and accept rules field are required', {
      cause: { code: 400 },
    });

  if (accept_rules !== true)
    throw new Error('You must accept rules', {
      cause: { code: 400 },
    });

  if (!validateIRPhoneSyntax(phone))
    throw new Error('Phone number is not valid', {
      cause: { code: 400 },
    });

  if (phone.startsWith('09')) phone = '+98' + phone.slice(1);

  const checkUser = await findOneUser({ phone });
  if (!checkUser) {
    const username = uuidv4().slice(0, 8);
    insertUser({
      username,
      phone,
      role: 'user',
    });
  }
};

export const sendCodeService = async (data) => {
  let { phone } = data;
  const code = generateNumber(5).toString();
  const {
    STATUS,
    KAVENEGAR_API_KEY: api_key,
    KAVENEGAR_VERIFY_TEMPLATE_NAME: template,
  } = process.env;

  const url = `https://api.kavenegar.com/v1/${api_key}/${template}/lookup.json`;

  const salt = await genSalt(10);
  const hashedCode = await hash(code, salt);

  if (STATUS == 'DEV') {
    if (phone.startsWith('09')) phone = '+98' + phone.slice(1);

    await updateOneUser({ phone }, { verify: { code: hashedCode, date: new Date() } });
    console.log(code);
    return code;
  }

  const response = await axios.post(
    url,
    new URLSearchParams({
      receptor: phone,
      token: code,
      template: template,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );

  if (response.data.return.status !== 200)
    throw new Error('Code sending failed', {
      cause: { code: 500 },
    });

  if (phone.startsWith('09')) phone = '+98' + phone.slice(1);

  await updateOneUser({ phone }, { verify: { code: hashedCode, date: new Date() } });
};

export const loginService = async (data) => {
  let { phone, code } = data;

  if ((!code, !phone))
    throw new Error('Phone number and code are required', {
      cause: { code: 400 },
    });

  if (!validateIRPhoneSyntax(phone))
    throw new Error('Phone number is not valid', {
      cause: { code: 400 },
    });

  if (phone.startsWith('09')) phone = '+98' + phone.slice(1);

  const user = await findOneUser({ phone });
  if (!user) throw new Error('User not found', { cause: { code: 404 } });

  const { verify } = user;

  console.log(verify)

  if (!verify) throw new Error('Missing send sms request', { cause: { code: 400 } });

  const { code: hashedCode, date } = verify;

  if (Date.now() - date > 1000 * 60 * 5)
    throw new Error('Code is expired', {
      cause: { code: 400 },
    });

  const isCodeValid = await compare(code.toString(), hashedCode);
  if (!isCodeValid)
    throw new Error('Code is not valid', {
      cause: { code: 400 },
    });

  const token = jwt.sign(
    {
      _id: user._id,
      phone: user.phone,
      username: user.username,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '30d',
    },
  );

  await updateOneUser({ phone }, { verify: null });

  return { _id: user._id, phone: user.phone, username: user.username, role: user.role, token };
};
