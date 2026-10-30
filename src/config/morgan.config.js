export const devLogFormat = {
  method: ':method',
  status: ':status',
  url: ':url',
  response_time: ':response-time ms',
};

export const prodLogFormat = {
  ip: ':remote-addr',
  method: ':method',
  status: ':status',
  url: ':url',
  response_time: ':response-time ms',
  date: ':date[iso]',
  user_agent: ':user-agent',
};

export const defaultLogFormat = {
  method: ':method',
  status: ':status',
  url: ':url',
  response_time: ':response-time ms',
};
