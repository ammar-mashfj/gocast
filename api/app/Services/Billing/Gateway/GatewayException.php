<?php

namespace App\Services\Billing\Gateway;

use RuntimeException;

/** The provider refused or could not be reached. The message is for logs and admins, not buyers. */
class GatewayException extends RuntimeException {}
