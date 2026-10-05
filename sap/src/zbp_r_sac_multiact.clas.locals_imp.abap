CLASS lhc_multiaction DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR multiaction RESULT result.

    METHODS run FOR MODIFY
      IMPORTING keys FOR ACTION multiaction~Run RESULT result.
ENDCLASS.

CLASS lhc_multiaction IMPLEMENTATION.

  METHOD get_global_authorizations.
  ENDMETHOD.


  " the steps in order: data actions and version publishing; the first failing step stops the run
  METHOD run.
    READ ENTITIES OF zr_sac_multiact IN LOCAL MODE
      ENTITY multiaction FIELDS ( ActionId ) WITH CORRESPONDING #( keys )
      RESULT DATA(actions).

    LOOP AT actions INTO DATA(action).
      DATA(param) = keys[ %tky = action-%tky ]-%param.
      DATA(log)   = VALUE string_table( ).
      DATA(failed_text) = ``.
      SELECT step_no, step_type, data_action_id, model_id, source_version, target_version
        FROM zsac_mastep WHERE action_id = @action-ActionId ORDER BY step_no INTO TABLE @DATA(steps).

      LOOP AT steps INTO DATA(step).
        CASE step-step_type.
          WHEN 'DATAACTION'.
            DATA(outcome) = zcl_sac_dataact_engine=>run( action_id = CONV #( step-data_action_id ) filter_text = param-FilterText ).
            IF outcome-status = 'E'.
              failed_text = |Step { step-step_no } failed: { concat_lines_of( table = outcome-log sep = `; ` ) }|.
            ELSE.
              APPEND |Step { step-step_no } data action { step-data_action_id }: { outcome-changed } values changed| TO log.
            ENDIF.
          WHEN 'PUBLISH'.
            DATA(published) = zcl_sac_version_engine=>publish( model_id = step-model_id
                                                               source   = step-source_version
                                                               target   = step-target_version ).
            IF published-ok = abap_false.
              failed_text = |Step { step-step_no } failed: { published-message }|.
            ELSE.
              APPEND |Step { step-step_no } publish { step-source_version } to { step-target_version }: { published-count } values| TO log.
            ENDIF.
          WHEN OTHERS.
            failed_text = |Step { step-step_no }: unknown type { step-step_type }|.
        ENDCASE.
        IF failed_text IS NOT INITIAL.
          EXIT.
        ENDIF.
      ENDLOOP.

      IF failed_text IS NOT INITIAL.
        APPEND failed_text TO log.
        APPEND VALUE #( %tky = action-%tky ) TO failed-multiaction.
        APPEND VALUE #( %tky = action-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = concat_lines_of( table = log sep = `; ` ) ) )
          TO reported-multiaction.
        CONTINUE.
      ENDIF.
      APPEND VALUE #( %tky = action-%tky
                      %param = VALUE #( Changed = 0 Status = 'S'
                                        LogText = concat_lines_of( table = log sep = cl_abap_char_utilities=>newline ) ) )
        TO result.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
