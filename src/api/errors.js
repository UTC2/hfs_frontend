const KEY_TO_MESSAGE = {
  ErrUsernameOrPasswordInvalid: 'Wrong email or password',
  ErrEmailExisted: 'An account with this email already exists',
  ErrWrongAuthHeader: 'Please sign in again',
  ErrInvalidRequest: 'Please check your input and try again',
  ErrInternal: 'Something went wrong. Please try again.',
  ErrNoPermission: "You don't have permission to do that",
}

const FALLBACK = 'Something went wrong. Please try again.'

export const mapErrorToMessage = (err) => {
  if (!err?.response?.data) {
    if (err?.message?.includes('Network')) return 'No network. Please check your connection.'
    return FALLBACK
  }
  const key = err.response.data.error_key
  return KEY_TO_MESSAGE[key] ?? FALLBACK
}

export default mapErrorToMessage
