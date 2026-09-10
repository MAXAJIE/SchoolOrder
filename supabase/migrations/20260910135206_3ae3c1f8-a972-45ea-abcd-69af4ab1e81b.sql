REVOKE ALL ON FUNCTION public.has_org_role(uuid, app_role) FROM anon;
REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.gen_code(integer) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM anon, authenticated, PUBLIC;

REVOKE ALL ON FUNCTION public.adjust_stock(uuid, integer, movement_reason, text) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_order(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, integer, movement_reason, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.create_public_order(uuid, text, integer, text, jsonb, payment_method, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_order_by_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_payment_proof(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order(uuid, text, integer, text, jsonb, payment_method, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_payment_proof(text, text) TO anon, authenticated;