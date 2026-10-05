CLASS lhc_dataaction DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR dataaction RESULT result.

    METHODS execute FOR MODIFY
      IMPORTING keys FOR ACTION dataaction~Execute RESULT result.
ENDCLASS.

CLASS lhc_dataaction IMPLEMENTATION.

  METHOD get_global_authorizations.
  ENDMETHOD.


  " runs the steps on the facts; the data filter parameter narrows every step
  METHOD execute.
    READ ENTITIES OF zr_sac_dataact IN LOCAL MODE
      ENTITY dataaction FIELDS ( ActionId ) WITH CORRESPONDING #( keys )
      RESULT DATA(actions).

    LOOP AT actions INTO DATA(action).
      DATA(param) = keys[ %tky = action-%tky ]-%param.
      DATA(outcome) = zcl_sac_dataact_engine=>run( action_id = action-ActionId filter_text = param-FilterText ).
      IF outcome-status = 'E'.
        APPEND VALUE #( %tky = action-%tky ) TO failed-dataaction.
        APPEND VALUE #( %tky = action-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = concat_lines_of( table = outcome-log sep = `; ` ) ) )
          TO reported-dataaction.
        CONTINUE.
      ENDIF.
      APPEND VALUE #( %tky = action-%tky
                      %param = VALUE #( Changed = outcome-changed Status = outcome-status
                                        LogText = concat_lines_of( table = outcome-log sep = cl_abap_char_utilities=>newline ) ) )
        TO result.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
