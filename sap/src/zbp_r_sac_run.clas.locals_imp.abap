CLASS lhc_actionrun DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR actionrun RESULT result.
ENDCLASS.

CLASS lhc_actionrun IMPLEMENTATION.

  METHOD get_global_authorizations.
    " the client writes one row per run; every planner may do that and read the history
  ENDMETHOD.

ENDCLASS.
