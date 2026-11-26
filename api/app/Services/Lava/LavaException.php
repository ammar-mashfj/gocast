<?php

namespace App\Services\Lava;

use RuntimeException;

/** lava.top could not be reached, or refused the request. */
class LavaException extends RuntimeException {}
