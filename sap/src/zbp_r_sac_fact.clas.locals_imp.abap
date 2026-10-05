CLASS lhc_fact DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR fact RESULT result.

    METHODS writefacts FOR MODIFY
      IMPORTING keys FOR ACTION fact~WriteFacts.

    METHODS deletefacts FOR MODIFY
      IMPORTING keys FOR ACTION fact~DeleteFacts.

    METHODS locked_version
      IMPORTING facts         TYPE zcl_sac_fact_writer=>ty_facts
      RETURNING VALUE(result) TYPE string.
ENDCLASS.

CLASS lhc_fact IMPLEMENTATION.

  METHOD get_global_authorizations.
  ENDMETHOD.


  " a locked version (Actual) is changed by import and data actions, never typed into
  METHOD locked_version.
    SELECT model_id, version_id FROM zsac_version WHERE locked = @abap_true INTO TABLE @DATA(locked).
    LOOP AT facts INTO DATA(f).
      IF line_exists( locked[ model_id = f-model_id version_id = f-version_id ] ).
        result = f-version_id.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD writefacts.
    LOOP AT keys INTO DATA(key).
      DATA(facts) = zcl_sac_fact_writer=>parse_payload( key-%param-Payload ).
      DATA(locked) = locked_version( facts ).
      IF locked IS NOT INITIAL.
        APPEND VALUE #( %cid = key-%cid ) TO failed-fact.
        APPEND VALUE #( %cid = key-%cid
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = |Version { locked } is locked| ) ) TO reported-fact.
        CONTINUE.
      ENDIF.
      zcl_sac_fact_writer=>upsert( facts = facts local_mode = abap_true ).
    ENDLOOP.
  ENDMETHOD.


  METHOD deletefacts.
    LOOP AT keys INTO DATA(key).
      DATA(facts) = zcl_sac_fact_writer=>parse_payload( key-%param-Payload ).
      DATA(locked) = locked_version( facts ).
      IF locked IS NOT INITIAL.
        APPEND VALUE #( %cid = key-%cid ) TO failed-fact.
        APPEND VALUE #( %cid = key-%cid
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = |Version { locked } is locked| ) ) TO reported-fact.
        CONTINUE.
      ENDIF.
      zcl_sac_fact_writer=>remove( facts = facts local_mode = abap_true ).
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
