CLASS lhc_cellcomment DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR cellcomment RESULT result.
ENDCLASS.

CLASS lhc_cellcomment IMPLEMENTATION.

  METHOD get_global_authorizations.
    " every planner may write and read comments; tighten here (or with a DCL role) per customer
  ENDMETHOD.

ENDCLASS.
