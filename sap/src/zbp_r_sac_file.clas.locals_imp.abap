CLASS lhc_file DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR file RESULT result.
ENDCLASS.

CLASS lhc_file IMPLEMENTATION.

  METHOD get_global_authorizations.
    " every planner may create and change these objects; tighten here (or with a DCL role) per customer
  ENDMETHOD.

ENDCLASS.
