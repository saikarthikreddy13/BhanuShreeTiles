class AppError(Exception):
    def __init__(self, status, message, errors=None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.errors = errors


def bad_request(message, errors=None):
    return AppError(400, message, errors)


def not_found(what="Record"):
    return AppError(404, f"{what} not found")


def conflict(message):
    return AppError(409, message)


def forbidden(message="You do not have permission for this action"):
    return AppError(403, message)
