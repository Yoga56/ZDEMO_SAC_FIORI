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

    "! the first model of the facts that the user may not edit (empty when all may be)
    METHODS no_access
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


  " plan data is written by the owner of the model and by whoever it was shared with for editing
  METHOD no_access.
    LOOP AT facts INTO DATA(f).
      IF zcl_sac_access=>can_edit( kind = 'MODEL' id = CONV #( f-model_id ) ) = abap_false.
        result = f-model_id.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD writefacts.
    LOOP AT keys INTO DATA(key).
      DATA(facts) = zcl_sac_fact_writer=>parse_payload( key-%param-Payload ).
      DATA(denied) = no_access( facts ).
      IF denied IS NOT INITIAL.
        APPEND VALUE #( %cid = key-%cid ) TO failed-fact.
        APPEND VALUE #( %cid = key-%cid
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = |You are not allowed to change the data of model { denied }| ) ) TO reported-fact.
        CONTINUE.
      ENDIF.
      DATA(locked) = locked_version( facts ).
      IF locked IS NOT INITIAL.
        APPEND VALUE #( %cid = key-%cid ) TO failed-fact.
        APPEND VALUE #( %cid = key-%cid
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = |Version { locked } is locked| ) ) TO reported-fact.
        CONTINUE.
      ENDIF.
      DATA(refused) = zcl_sac_data_rules=>violation( facts = facts ).
      IF refused IS NOT INITIAL.
        APPEND VALUE #( %cid = key-%cid ) TO failed-fact.
        APPEND VALUE #( %cid = key-%cid
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error text = refused ) ) TO reported-fact.
        CONTINUE.
      ENDIF.
      zcl_sac_fact_writer=>upsert( facts = facts local_mode = abap_true ).
    ENDLOOP.
  ENDMETHOD.


  METHOD deletefacts.
    LOOP AT keys INTO DATA(key).
      DATA(facts) = zcl_sac_fact_writer=>parse_payload( key-%param-Payload ).
      DATA(denied) = no_access( facts ).
      IF denied IS NOT INITIAL.
        APPEND VALUE #( %cid = key-%cid ) TO failed-fact.
        APPEND VALUE #( %cid = key-%cid
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = |You are not allowed to change the data of model { denied }| ) ) TO reported-fact.
        CONTINUE.
      ENDIF.
      DATA(locked) = locked_version( facts ).
      IF locked IS NOT INITIAL.
        APPEND VALUE #( %cid = key-%cid ) TO failed-fact.
        APPEND VALUE #( %cid = key-%cid
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = |Version { locked } is locked| ) ) TO reported-fact.
        CONTINUE.
      ENDIF.
      DATA(refused) = zcl_sac_data_rules=>violation( facts = VALUE #( ) deletes = facts ).
      IF refused IS NOT INITIAL.
        APPEND VALUE #( %cid = key-%cid ) TO failed-fact.
        APPEND VALUE #( %cid = key-%cid
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error text = refused ) ) TO reported-fact.
        CONTINUE.
      ENDIF.
      zcl_sac_fact_writer=>remove( facts = facts local_mode = abap_true ).
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
