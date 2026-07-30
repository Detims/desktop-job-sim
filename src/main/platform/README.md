# Platform boundary

Windows-specific window, display, lock/sleep, credential, notification, and
deep-link behavior belongs behind interfaces in this directory. Domain and
simulation packages must not import Electron or Windows APIs.
