import axios from 'axios';
const endpoint = 'https://next.zarinpal.com/api/v4/graphql/';
const mutation = `mutation AddRefund($session_id: ID!, $amount: BigInteger!, $description: String, $method: InstantPayoutActionTypeEnum, $reason: RefundReasonEnum) {
  resource: AddRefund(session_id: $session_id, amount: $amount, description: $description, method: $method, reason: $reason) {
    id terminal_id amount timeline { refund_amount refund_time refund_status }
  }
}`;
const query = `query SessionById($id: ID) { resource: Session(id: $id) { id amount terminal { id } timeline { refund_status refund_amount refund_time } } }`;
export function createZarinpalRefundGateway({ http = axios, env = process.env } = {}) {
  const ready = () => {
    if (!env.ZARINPAL_ACCESS_TOKEN?.trim())
      throw new Error(
        'ZARINPAL_ACCESS_TOKEN is required for refunds (merchant id alone is not sufficient)',
        { cause: { code: 503 } },
      );
  };
  async function send(query, variables) {
    ready();
    let response;
    try {
      response = await http.post(
        endpoint,
        { query, variables },
        {
          timeout: 20000,
          headers: {
            Authorization: `Bearer ${env.ZARINPAL_ACCESS_TOKEN.trim().replace(/^Bearer\s+/i, '')}`,
            Accept: 'application/json',
          },
        },
      );
    } catch (e) {
      // Transport/server failures are uncertain. Explicit authentication rejection cannot move money.
      if ([401, 403].includes(e.response?.status)) {
        const error = new Error('Zarinpal access denied');
        error.definitive = true;
        throw error;
      }
      throw new Error('Zarinpal request outcome unknown');
    }
    if (response.data?.errors?.length && !response.data?.data?.resource) {
      // Only parse/validation/authentication errors prove the mutation did not execute.
      const knownCodes = [
        'GRAPHQL_PARSE_FAILED',
        'GRAPHQL_VALIDATION_FAILED',
        'UNAUTHENTICATED',
        'FORBIDDEN',
      ];
      const error = new Error('Zarinpal GraphQL error');
      error.definitive = response.data.errors.every((item) =>
        knownCodes.includes(item.extensions?.code),
      );
      throw error;
    }
    const raw = response.data?.data?.resource;
    const resource = Array.isArray(raw)
      ? raw.find((row) => String(row.id) === String(variables.id))
      : raw;
    if (!resource || Array.isArray(resource)) throw new Error('Invalid Zarinpal refund response');
    return resource;
  }
  return {
    ready,
    add: (variables) => send(mutation, variables),
    inquiry: (id) => send(query, { id }),
  };
}
