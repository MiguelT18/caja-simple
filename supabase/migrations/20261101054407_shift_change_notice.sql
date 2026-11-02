-- Aviso a la dueña cuando una empleada cambia su turno. Va en su propia migración: un valor nuevo de enum
-- no se puede usar en la misma transacción que lo crea (lo usa change_my_shift, en la siguiente).
alter type public.notification_kind add value if not exists 'shift_change';
