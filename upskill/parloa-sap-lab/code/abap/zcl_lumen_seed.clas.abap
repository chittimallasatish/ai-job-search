"! Seeds ZLUMEN_ORDERS with demo data. Run in ADT with F9 (console application).
CLASS zcl_lumen_seed DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
ENDCLASS.

CLASS zcl_lumen_seed IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    DATA orders TYPE STANDARD TABLE OF zlumen_orders WITH EMPTY KEY.

    orders = VALUE #(
      ( order_id = '0000004711' customer_id = '1000001' requested_date = '20261125'
        process_status = 'B' delivery_status = 'A' net_amount = '2140.00' currency = 'USD' )
      ( order_id = '0000004712' customer_id = '1000002' requested_date = '20261110'
        process_status = 'C' delivery_status = 'C' net_amount = '1299.00' currency = 'USD' )
      ( order_id = '0000004713' customer_id = '1000003' requested_date = '20261204'
        process_status = 'A' delivery_status = 'A' net_amount = '849.50'  currency = 'USD' ) ).

    DELETE FROM zlumen_orders.
    INSERT zlumen_orders FROM TABLE @orders.
    COMMIT WORK.
    out->write( |{ lines( orders ) } demo orders written to ZLUMEN_ORDERS| ).
  ENDMETHOD.
ENDCLASS.
