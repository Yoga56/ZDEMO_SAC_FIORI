CLASS lhc_dataaction DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR dataaction RESULT result.
ENDCLASS.

CLASS lhc_dataaction IMPLEMENTATION.

  METHOD get_global_authorizations.
    " data actions run in the client; tighten who may change the definitions here (or with a DCL role) per customer
  ENDMETHOD.

ENDCLASS.
