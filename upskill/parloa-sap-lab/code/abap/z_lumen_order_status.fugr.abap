"! Create function group ZLUMEN_RFC first, then this function module.
"! Attributes: Processing Type = Remote-Enabled Module (RFC). All parameters pass-by-value (required for RFC).
FUNCTION z_lumen_order_status
  IMPORTING
    VALUE(iv_order_id) TYPE char10
  EXPORTING
    VALUE(es_order)    TYPE zlumen_s_order_status
    VALUE(et_return)   TYPE bapiret2_t.

  CLEAR: es_order, et_return.

  " Callers (an AI agent!) send "4711", the table stores "0000004711".
  DATA(lv_order_id) = CONV char10( |{ iv_order_id ALPHA = IN }| ).

  IF lv_order_id IS INITIAL.
    APPEND VALUE #( type = 'E' id = 'ZLUMEN' number = '001'
                    message = 'Order number is required' ) TO et_return.
    RETURN.
  ENDIF.

  SELECT SINGLE FROM zlumen_orders
    FIELDS order_id, customer_id, requested_date, process_status,
           delivery_status, net_amount, currency
    WHERE order_id = @lv_order_id
    INTO CORRESPONDING FIELDS OF @es_order.

  IF sy-subrc <> 0.
    APPEND VALUE #( type = 'E' id = 'ZLUMEN' number = '002'
                    message = |Order { iv_order_id } not found|
                    message_v1 = iv_order_id ) TO et_return.
    RETURN.
  ENDIF.

  APPEND VALUE #( type = 'S' id = 'ZLUMEN' number = '000'
                  message = |Order { iv_order_id } read| ) TO et_return.
ENDFUNCTION.
